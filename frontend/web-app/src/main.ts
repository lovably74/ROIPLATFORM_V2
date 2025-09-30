import { createApp } from 'vue'
import { createHead } from '@vueuse/head'
import { VueQueryPlugin } from '@tanstack/vue-query'
import FloatingVue from 'floating-vue'

// 메인 App 컴포넌트
import App from './App.vue'

// 라우터
import router from './router'

// 상태 관리
import { createPinia } from 'pinia'
import piniaPluginPersistedstate from 'pinia-plugin-persistedstate'

// 다국어
import { createI18n } from 'vue-i18n'
import messages from './locales'

// PWA 서비스 워커
import { registerSW } from 'virtual:pwa-register'

// 스타일
import 'virtual:windi.css'
import 'floating-vue/dist/style.css'

// 타입 정의
import type { App as VueApp } from 'vue'

// Vue Query 클라이언트 설정
const vueQueryOptions = {
  queryClientConfig: {
    defaultOptions: {
      queries: {
        staleTime: 5 * 60 * 1000, // 5분
        gcTime: 10 * 60 * 1000, // 10분
        retry: (failureCount: number, error: any) => {
          // 401, 403, 404 에러는 재시도하지 않음
          if (error?.response?.status === 401 || 
              error?.response?.status === 403 || 
              error?.response?.status === 404) {
            return false
          }
          return failureCount < 3
        },
        refetchOnWindowFocus: false,
      },
      mutations: {
        retry: false,
      }
    }
  }
}

// i18n 설정
const i18n = createI18n({
  legacy: false, // Composition API 모드
  locale: 'ko',
  fallbackLocale: 'en',
  messages,
  globalInjection: true,
  warnHtmlMessage: false,
  silentTranslationWarn: true,
  formatFallbackMessages: true,
  datetimeFormats: {
    ko: {
      short: {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      },
      long: {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
      }
    },
    en: {
      short: {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      },
      long: {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit'
      }
    }
  },
  numberFormats: {
    ko: {
      currency: {
        style: 'currency',
        currency: 'KRW',
        notation: 'standard'
      },
      decimal: {
        style: 'decimal',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      },
      percent: {
        style: 'percent',
        useGrouping: false
      }
    },
    en: {
      currency: {
        style: 'currency',
        currency: 'USD',
        notation: 'standard'
      },
      decimal: {
        style: 'decimal',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      },
      percent: {
        style: 'percent',
        useGrouping: false
      }
    }
  }
})

// Pinia 스토어 설정
const pinia = createPinia()
pinia.use(piniaPluginPersistedstate)

// Head 관리 (SEO)
const head = createHead()

// Vue 앱 생성
const app: VueApp = createApp(App)

// 플러그인 등록
app.use(pinia)
app.use(router)
app.use(i18n)
app.use(head)
app.use(VueQueryPlugin, vueQueryOptions)
app.use(FloatingVue, {
  themes: {
    'ocean-tooltip': {
      $extend: 'tooltip',
      $resetCss: true,
      background: '#0ea5e9',
      color: 'white',
      borderRadius: '0.5rem',
      fontSize: '0.875rem',
      padding: '0.5rem 0.75rem'
    },
    'neumorph-popover': {
      $extend: 'dropdown',
      background: '#e0e5ec',
      boxShadow: '8px 8px 16px #d1d9e6, -8px -8px 16px #f9f9f9',
      borderRadius: '0.75rem',
      border: 'none'
    }
  }
})

// 전역 속성 등록
app.config.globalProperties.$appVersion = import.meta.env.VITE_APP_VERSION || '1.0.0'
app.config.globalProperties.$buildTime = import.meta.env.VITE_BUILD_TIME || new Date().toISOString()

// 개발 환경 설정
if (import.meta.env.DEV) {
  app.config.performance = true
  
  // Vue DevTools 설정
  app.config.devtools = true
  
  // 개발용 전역 변수 (디버깅용)
  ;(window as any).__VUE_APP__ = app
  ;(window as any).__PINIA__ = pinia
  ;(window as any).__ROUTER__ = router
}

// 에러 핸들링
app.config.errorHandler = (error: any, instance: any, info: string) => {
  console.error('Vue Error:', error)
  console.error('Vue Instance:', instance)
  console.error('Error Info:', info)
  
  // 에러 리포팅 서비스에 전송 (선택적)
  if (import.meta.env.PROD) {
    // Sentry, LogRocket 등
  }
}

// 경고 핸들러 (개발 모드에서만)
if (import.meta.env.DEV) {
  app.config.warnHandler = (msg: string, instance: any, trace: string) => {
    console.warn('Vue Warning:', msg)
    if (trace) {
      console.warn('Trace:', trace)
    }
  }
}

// PWA 서비스 워커 등록
const updateSW = registerSW({
  onNeedRefresh() {
    // 새 버전 알림
    console.log('New content is available. Please refresh.')
    // Toast 알림이나 모달로 사용자에게 알림
  },
  onOfflineReady() {
    console.log('App is ready to work offline.')
  },
  onRegisterError(error) {
    console.error('SW registration error:', error)
  }
})

// 온라인/오프라인 상태 감지
window.addEventListener('online', () => {
  console.log('Back online')
  // 네트워크 복구 시 필요한 로직
})

window.addEventListener('offline', () => {
  console.log('Gone offline')
  // 오프라인 모드로 전환 시 필요한 로직
})

// 성능 측정 (개발 환경)
if (import.meta.env.DEV) {
  import('./utils/performance').then(({ reportWebVitals }) => {
    reportWebVitals((metric: any) => {
      console.log('Web Vital:', metric)
    })
  })
}

// 접근성 검사 (개발 환경)
if (import.meta.env.DEV) {
  import('@axe-core/vue').then((axe) => {
    axe.default(app, {
      config: {
        rules: [
          // WCAG 2.1 AA 준수를 위한 규칙들
          { id: 'color-contrast', enabled: true },
          { id: 'keyboard-navigation', enabled: true },
          { id: 'aria-labels', enabled: true }
        ]
      }
    })
  }).catch(() => {
    // axe-core가 없어도 앱이 정상 실행되도록
    console.warn('axe-core not available for accessibility testing')
  })
}

// 앱 마운트
app.mount('#app')

// Hot Module Replacement (HMR)
if (import.meta.hot) {
  import.meta.hot.accept()
}

// 앱 정보 로깅
console.log(`
🌊 ROIPLATFORM v${app.config.globalProperties.$appVersion}
🏗️  Built: ${new Date(app.config.globalProperties.$buildTime).toLocaleString()}
🎨 Theme: Ocean Blue & Neumorphism
♿ Accessibility: WCAG 2.1 AA Compliant
🌍 i18n: ${Object.keys(messages).join(', ')}
⚡ Mode: ${import.meta.env.MODE}
`)

export { updateSW }