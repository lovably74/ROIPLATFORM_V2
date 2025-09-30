<template>
  <div id="app" class="min-h-screen bg-gray-50 font-sans antialiased">
    <!-- 글로벌 로딩 표시 -->
    <Transition name="fade">
      <div 
        v-if="appStore.isLoading" 
        class="fixed inset-0 z-100 flex-center bg-white/80 backdrop-blur-sm"
        role="status" 
        aria-live="polite"
      >
        <div class="text-center">
          <div class="w-12 h-12 mx-auto mb-4 border-4 border-sky-200 border-t-sky-500 rounded-full animate-spin" />
          <p class="text-sm text-gray-600">{{ $t('common.loading') }}</p>
        </div>
      </div>
    </Transition>

    <!-- 메인 라우터 뷰 -->
    <RouterView v-slot="{ Component, route }">
      <Transition :name="route.meta?.transition || 'fade'" mode="out-in">
        <Suspense>
          <component :is="Component" :key="route.path" />
          
          <template #fallback>
            <div class="min-h-screen flex-center">
              <div class="text-center">
                <div class="w-8 h-8 mx-auto mb-4 border-3 border-sky-200 border-t-sky-500 rounded-full animate-spin" />
                <p class="text-sm text-gray-500">{{ $t('common.loadingPage') }}</p>
              </div>
            </div>
          </template>
        </Suspense>
      </Transition>
    </RouterView>

    <!-- 전역 토스트 알림 -->
    <Toaster 
      :position="'top-right'"
      :theme="isDark ? 'dark' : 'light'"
      :rich-colors="true"
      :close-button="true"
    />

    <!-- 전역 모달 포털 -->
    <Teleport to="body">
      <div id="modal-portal" />
    </Teleport>

    <!-- 접근성 개선을 위한 스킵 링크 -->
    <div class="sr-only">
      <a 
        href="#main-content" 
        class="fixed top-4 left-4 z-100 px-4 py-2 bg-sky-600 text-white rounded-md focus:not-sr-only focus:absolute"
      >
        {{ $t('accessibility.skipToContent') }}
      </a>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useDark, useToggle } from '@vueuse/core'
import { useI18n } from 'vue-i18n'
import { Toaster } from 'vue-sonner'

// Stores
import { useAppStore } from '@/stores/app'
import { useAuthStore } from '@/stores/auth'
import { useProjectStore } from '@/stores/project'

// Services
import { authService } from '@/services/auth'

// Types
import type { RouteLocationNormalized } from 'vue-router'

// 다크 모드 설정
const isDark = useDark({
  selector: 'html',
  attribute: 'class',
  valueDark: 'dark',
  valueLight: 'light',
})
const toggleDark = useToggle(isDark)

// 스토어
const appStore = useAppStore()
const authStore = useAuthStore()
const projectStore = useProjectStore()

// 라우터 & i18n
const router = useRouter()
const { locale } = useI18n()

// 앱 초기화
onMounted(async () => {
  try {
    appStore.setLoading(true)
    
    // 1. 테넌트/프로젝트 컨텍스트 확인
    await projectStore.resolveProjectContext()
    
    // 2. 인증 상태 복원
    if (authStore.hasStoredToken()) {
      await authStore.restoreAuth()
    }
    
    // 3. 다국어 설정 초기화
    await appStore.initializeI18n()
    
    // 4. 프로젝트별 설정 로드
    if (projectStore.currentProject) {
      await projectStore.loadProjectSettings()
    }
    
  } catch (error) {
    console.error('App initialization failed:', error)
    appStore.addNotification({
      type: 'error',
      title: 'Initialization Error',
      message: 'Failed to initialize application'
    })
  } finally {
    appStore.setLoading(false)
  }
})

// 라우트 변경 감지 (페이지 타이틀 업데이트, 권한 체크 등)
watch(
  () => router.currentRoute.value,
  async (to: RouteLocationNormalized) => {
    // 페이지 타이틀 업데이트
    if (to.meta?.title) {
      const title = typeof to.meta.title === 'string' 
        ? to.meta.title 
        : to.meta.title(to)
      document.title = `${title} | ROIPLATFORM`
    }

    // 인증 필요한 페이지 체크
    if (to.meta?.requiresAuth && !authStore.isAuthenticated) {
      await router.push({
        name: 'Login',
        query: { redirect: to.fullPath }
      })
      return
    }

    // 권한 체크
    if (to.meta?.permissions) {
      const hasPermission = Array.isArray(to.meta.permissions)
        ? to.meta.permissions.some(permission => authStore.hasPermission(permission))
        : authStore.hasPermission(to.meta.permissions)
      
      if (!hasPermission) {
        appStore.addNotification({
          type: 'error',
          title: 'Access Denied',
          message: 'You do not have permission to access this page'
        })
        await router.push({ name: 'Dashboard' })
        return
      }
    }

    // 페이지 방문 기록 (선택적)
    if (process.env.NODE_ENV === 'production' && to.meta?.trackPageView) {
      // Analytics 추적 코드
    }
  },
  { immediate: true }
)

// 언어 변경 감지
watch(locale, (newLocale) => {
  document.documentElement.lang = newLocale
  // HTML dir 속성 설정 (RTL 언어 지원)
  document.documentElement.dir = ['ar', 'he', 'fa'].includes(newLocale) ? 'rtl' : 'ltr'
})

// 글로벌 에러 핸들러
const handleGlobalError = (error: Error, instance: any, info: string) => {
  console.error('Global error:', error, info)
  
  appStore.addNotification({
    type: 'error',
    title: 'Unexpected Error',
    message: 'An unexpected error occurred. Please try again.',
    duration: 10000
  })
}

// 프로미스 에러 핸들러 (Vue와 독립적인 에러)
window.addEventListener('unhandledrejection', (event) => {
  console.error('Unhandled promise rejection:', event.reason)
  
  appStore.addNotification({
    type: 'error',
    title: 'Network Error',
    message: 'A network error occurred. Please check your connection.',
    duration: 8000
  })
  
  event.preventDefault()
})

// Vue 전역 설정
const app = getCurrentInstance()?.appContext.app
if (app) {
  app.config.errorHandler = handleGlobalError
}
</script>

<style>
/* 전역 스타일 */
@import 'virtual:windi.css';
@import url('https://fonts.googleapis.com/css2?family=Roboto:wght@300;400;500;700&family=Noto+Sans+KR:wght@300;400;500;700&display=swap');

/* CSS 변수 - Ocean Blue 테마 */
:root {
  --color-primary: #0ea5e9;
  --color-primary-dark: #0284c7;
  --color-accent: #38bdf8;
  --color-success: #10b981;
  --color-warning: #f59e0b;
  --color-error: #ef4444;
  --color-info: #3b82f6;
}

/* 다크 모드 변수 */
.dark {
  --color-primary: #0ea5e9;
  --color-primary-dark: #38bdf8;
  --color-accent: #7dd3fc;
}

/* 기본 스타일링 */
html {
  scroll-behavior: smooth;
  font-feature-settings: "rlig" 1, "calt" 1;
}

body {
  font-family: 'Roboto', 'Noto Sans KR', system-ui, -apple-system, sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  text-rendering: optimizeLegibility;
}

/* 포커스 스타일 - 접근성 */
*:focus {
  outline: none;
}

*:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: 2px;
  border-radius: 0.375rem;
}

/* 텍스트 선택 스타일 */
::selection {
  background-color: rgb(14 165 233 / 0.2);
  color: inherit;
}

/* 스크롤바 스타일링 */
::-webkit-scrollbar {
  width: 8px;
  height: 8px;
}

::-webkit-scrollbar-track {
  background: #f1f5f9;
  border-radius: 4px;
}

::-webkit-scrollbar-thumb {
  background: #cbd5e1;
  border-radius: 4px;
  border: 1px solid #f1f5f9;
}

::-webkit-scrollbar-thumb:hover {
  background: var(--color-primary);
}

/* 트랜지션 애니메이션 */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

.slide-up-enter-active,
.slide-up-leave-active {
  transition: all 0.3s ease;
}

.slide-up-enter-from {
  opacity: 0;
  transform: translateY(20px);
}

.slide-up-leave-to {
  opacity: 0;
  transform: translateY(-20px);
}

.slide-right-enter-active,
.slide-right-leave-active {
  transition: all 0.3s ease;
}

.slide-right-enter-from {
  opacity: 0;
  transform: translateX(-20px);
}

.slide-right-leave-to {
  opacity: 0;
  transform: translateX(20px);
}

/* 모션 감소 모드 지원 */
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}

/* 고대비 모드 지원 */
@media (prefers-contrast: high) {
  :root {
    --color-primary: #0066cc;
    --color-accent: #0088ff;
  }
}

/* 인쇄 스타일 */
@media print {
  * {
    background: transparent !important;
    color: black !important;
    box-shadow: none !important;
    text-shadow: none !important;
  }
  
  .no-print {
    display: none !important;
  }
  
  a,
  a:visited {
    text-decoration: underline;
  }
}
</style>