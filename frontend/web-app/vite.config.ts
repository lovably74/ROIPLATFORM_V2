import { defineConfig } from 'vite'
import { fileURLToPath, URL } from 'node:url'
import vue from '@vitejs/plugin-vue'
import vueJsx from '@vitejs/plugin-vue-jsx'
import { VitePWA } from 'vite-plugin-pwa'
import WindiCSS from 'vite-plugin-windicss'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    vue({
      // Vue 3 Composition API 최적화
      reactivityTransform: true,
      script: {
        defineModel: true,
        propsDestructure: true
      }
    }),
    vueJsx(),
    WindiCSS({
      scan: {
        dirs: ['src'],
        fileExtensions: ['vue', 'js', 'ts', 'tsx']
      }
    }),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'masked-icon.svg'],
      manifest: {
        name: 'ROIPLATFORM',
        short_name: 'ROI Platform',
        description: '통합 ROI 관리 플랫폼',
        theme_color: '#0ea5e9',
        background_color: '#ffffff',
        display: 'standalone',
        icons: [
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png'
          }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-cache',
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 24 * 365 // 1 year
              },
              cacheKeyWillBeUsed: async ({ request }) => `${request.url}?v=1`
            }
          },
          {
            urlPattern: /^https:\/\/api\.roiplatform\.com\/.*/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'api-cache',
              networkTimeoutSeconds: 10,
              expiration: {
                maxEntries: 100,
                maxAgeSeconds: 60 * 60 * 24 // 1 day
              }
            }
          }
        ]
      }
    })
  ],

  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      '~': fileURLToPath(new URL('./src', import.meta.url)),
      '@components': fileURLToPath(new URL('./src/components', import.meta.url)),
      '@views': fileURLToPath(new URL('./src/views', import.meta.url)),
      '@stores': fileURLToPath(new URL('./src/stores', import.meta.url)),
      '@utils': fileURLToPath(new URL('./src/utils', import.meta.url)),
      '@assets': fileURLToPath(new URL('./src/assets', import.meta.url)),
      '@types': fileURLToPath(new URL('./src/types', import.meta.url))
    }
  },

  define: {
    // Vue 3 Feature Flags
    __VUE_OPTIONS_API__: false, // Composition API만 사용
    __VUE_PROD_DEVTOOLS__: false,
    __VUE_PROD_HYDRATION_MISMATCH_DETAILS__: false,
    // 환경 변수
    __APP_VERSION__: JSON.stringify(process.env.npm_package_version),
    __BUILD_TIME__: JSON.stringify(new Date().toISOString())
  },

  server: {
    host: true,
    port: 3000,
    strictPort: true,
    proxy: {
      // API 프록시 설정
      '/api': {
        target: process.env.VITE_API_BASE_URL || 'http://localhost:8080',
        changeOrigin: true,
        secure: false,
        configure: (proxy, _options) => {
          proxy.on('error', (err, _req, _res) => {
            console.log('proxy error', err)
          })
          proxy.on('proxyReq', (proxyReq, req, _res) => {
            console.log('Sending Request to the Target:', req.method, req.url)
          })
          proxy.on('proxyRes', (proxyRes, req, _res) => {
            console.log('Received Response from the Target:', proxyRes.statusCode, req.url)
          })
        }
      },
      // WebSocket 프록시 (실시간 알림용)
      '/ws': {
        target: process.env.VITE_WS_BASE_URL || 'ws://localhost:8080',
        ws: true,
        changeOrigin: true
      }
    }
  },

  build: {
    target: 'es2020',
    cssCodeSplit: true,
    sourcemap: process.env.NODE_ENV !== 'production',
    rollupOptions: {
      output: {
        manualChunks: {
          // Vue 코어
          'vue-vendor': ['vue', 'vue-router', 'pinia'],
          // UI 라이브러리
          'ui-vendor': ['@vueuse/core', 'floating-vue', 'vue-sonner'],
          // 유틸리티
          'utils-vendor': ['axios', 'dayjs', 'lodash-es'],
          // 폼 관련
          'form-vendor': ['vee-validate', '@vee-validate/zod', 'zod'],
          // 다국어
          'i18n-vendor': ['vue-i18n']
        }
      }
    },
    // 청크 크기 경고 임계값
    chunkSizeWarningLimit: 1000
  },

  optimizeDeps: {
    include: [
      'vue',
      'vue-router',
      'pinia',
      '@vueuse/core',
      'axios',
      'dayjs',
      'lodash-es'
    ],
    exclude: ['@iconify/vue']
  },

  // 테스트 설정 (Vitest)
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'src/test/',
        '**/*.d.ts',
        '**/*.config.*'
      ]
    }
  },

  // CSS 전처리기 설정
  css: {
    preprocessorOptions: {
      scss: {
        additionalData: `
          @import "@/assets/styles/variables.scss";
          @import "@/assets/styles/mixins.scss";
        `
      }
    }
  },

  // 환경별 설정
  envPrefix: 'VITE_',
  envDir: '.',

  // 레거시 브라우저 지원
  legacy: {
    targets: ['> 1%', 'last 2 versions', 'not dead', 'not ie 11']
  }
})