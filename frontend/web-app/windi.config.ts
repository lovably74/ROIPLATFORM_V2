import { defineConfig } from 'windicss/helpers'
import colors from 'windicss/colors'
import typography from 'windicss/plugin/typography'
import aspectRatio from 'windicss/plugin/aspect-ratio'

export default defineConfig({
  darkMode: 'class', // 'media' or 'class'
  
  // WindiCSS 스캔 경로
  extract: {
    include: ['**/*.{vue,html,jsx,tsx,ts,js}'],
    exclude: ['node_modules', '.git']
  },

  // 선 적용 설정
  preflight: {
    safelist: 'h1 h2 h3 h4 h5 h6 p a button input'
  },

  // Shortcuts (자주 사용하는 클래스 조합)
  shortcuts: {
    // Ocean Blue 기본 버튼
    'btn-primary': 'bg-sky-500 hover:bg-sky-600 text-white font-medium py-2.5 px-4 rounded-lg shadow-md hover:shadow-lg transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-opacity-50',
    
    // Neumorphism 스타일 버튼
    'btn-neumorph': 'bg-gray-200 text-gray-700 font-medium py-2.5 px-4 rounded-lg shadow-neumorph hover:shadow-neumorph-hover active:shadow-neumorph-pressed transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-opacity-50',
    
    // 보조 버튼
    'btn-secondary': 'bg-sky-600 hover:bg-sky-700 text-white font-medium py-2.5 px-4 rounded-lg shadow-md hover:shadow-lg transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-sky-600 focus:ring-opacity-50',
    
    // 기본 입력 필드
    'input-base': 'w-full px-3 py-2.5 border border-gray-300 rounded-lg bg-white text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent transition-all duration-200',
    
    // Neumorphism 입력 필드
    'input-neumorph': 'w-full px-3 py-2.5 bg-gray-100 border-none rounded-lg text-gray-900 placeholder-gray-500 shadow-neumorph-inset focus:outline-none focus:shadow-neumorph-pressed transition-all duration-200',
    
    // 카드 컴포넌트
    'card': 'bg-white rounded-xl shadow-md border border-gray-200 p-6 hover:shadow-lg transition-all duration-200',
    'card-neumorph': 'bg-gray-100 rounded-xl shadow-neumorph p-6 hover:shadow-neumorph-hover transition-all duration-300',
    
    // 레이아웃
    'container-main': 'max-w-7xl mx-auto px-4 sm:px-6 lg:px-8',
    'flex-center': 'flex items-center justify-center',
    'flex-between': 'flex items-center justify-between',
    
    // 텍스트 스타일
    'text-heading': 'font-bold text-gray-900 leading-tight',
    'text-body': 'text-gray-700 leading-relaxed',
    'text-muted': 'text-gray-500',
    
    // 애니메이션
    'fade-in': 'opacity-0 animate-fadeIn',
    'slide-up': 'translate-y-4 opacity-0 animate-slideUp'
  },

  theme: {
    extend: {
      // Ocean Blue 컬러 시스템
      colors: {
        // Primary Sky Blue
        sky: {
          50: '#f0f9ff',
          100: '#e0f2fe',
          200: '#bae6fd',
          300: '#7dd3fc',
          400: '#38bdf8', // 밝은 파랑 (accent)
          500: '#0ea5e9', // 기본 primary
          600: '#0284c7', // 진한 파랑 (secondary)
          700: '#0369a1',
          800: '#075985',
          900: '#0c4a6e',
          950: '#082f49'
        },
        
        // 추가 의미론적 색상
        success: colors.emerald,
        warning: colors.amber,
        error: colors.red,
        info: colors.blue,
        
        // Neumorphism 전용 그레이
        neumorph: {
          50: '#f9f9f9',
          100: '#f0f0f0',
          200: '#e0e5ec', // 기본 배경
          300: '#d1d9e6',
          400: '#a3b1cc',
          500: '#8b98b3',
          600: '#6b7280',
          700: '#4b5563',
          800: '#374151',
          900: '#1f2937'
        }
      },

      // 커스텀 그림자 (Neumorphism)
      boxShadow: {
        'neumorph': '8px 8px 16px #d1d9e6, -8px -8px 16px #f9f9f9',
        'neumorph-inset': 'inset 4px 4px 8px #d1d9e6, inset -4px -4px 8px #f9f9f9',
        'neumorph-pressed': 'inset 2px 2px 4px #d1d9e6, inset -2px -2px 4px #f9f9f9',
        'neumorph-hover': '12px 12px 24px #d1d9e6, -12px -12px 24px #f9f9f9',
        'neumorph-sm': '4px 4px 8px #d1d9e6, -4px -4px 8px #f9f9f9',
        'neumorph-lg': '16px 16px 32px #d1d9e6, -16px -16px 32px #f9f9f9'
      },

      // 폰트 패밀리
      fontFamily: {
        sans: ['Roboto', 'Noto Sans KR', 'system-ui', 'sans-serif'],
        noto: ['Noto Sans KR', 'Roboto', 'system-ui', 'sans-serif']
      },

      // 타이포그래피 크기
      fontSize: {
        xs: ['0.75rem', { lineHeight: '1.4' }],
        sm: ['0.875rem', { lineHeight: '1.4' }],
        base: ['1rem', { lineHeight: '1.5' }],
        lg: ['1.125rem', { lineHeight: '1.4' }], // h4
        xl: ['1.25rem', { lineHeight: '1.4' }],  // h3
        '2xl': ['1.5rem', { lineHeight: '1.3' }], // h2
        '3xl': ['2rem', { lineHeight: '1.2' }],   // h1
        '4xl': ['2.5rem', { lineHeight: '1.1' }],
        '5xl': ['3rem', { lineHeight: '1' }]
      },

      // 애니메이션
      animation: {
        'fadeIn': 'fadeIn 0.6s ease-out forwards',
        'slideUp': 'slideUp 0.4s ease-out forwards',
        'slideInRight': 'slideInRight 0.3s ease-out forwards',
        'pulse-neumorph': 'pulseNeumorph 2s ease-in-out infinite',
        'bounce-gentle': 'bounceGentle 2s infinite'
      },

      keyframes: {
        fadeIn: {
          '0%': { opacity: '0', transform: 'translateY(10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' }
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(20px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' }
        },
        slideInRight: {
          '0%': { opacity: '0', transform: 'translateX(20px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' }
        },
        pulseNeumorph: {
          '0%, 100%': { boxShadow: '8px 8px 16px #d1d9e6, -8px -8px 16px #f9f9f9' },
          '50%': { boxShadow: '12px 12px 24px #d1d9e6, -12px -12px 24px #f9f9f9' }
        },
        bounceGentle: {
          '0%, 20%, 50%, 80%, 100%': { transform: 'translateY(0)' },
          '40%': { transform: 'translateY(-4px)' },
          '60%': { transform: 'translateY(-2px)' }
        }
      },

      // 간격 시스템
      spacing: {
        '18': '4.5rem',
        '88': '22rem',
        '128': '32rem'
      },

      // 브레이크포인트
      screens: {
        'xs': '475px',
        '3xl': '1600px'
      },

      // 반경
      borderRadius: {
        '4xl': '2rem'
      },

      // z-index
      zIndex: {
        '60': '60',
        '70': '70',
        '80': '80',
        '90': '90',
        '100': '100'
      },

      // 백드롭 블러
      backdropBlur: {
        xs: '2px'
      }
    }
  },

  plugins: [
    typography(),
    aspectRatio(),
    
    // 커스텀 플러그인 - 접근성 및 유틸리티
    require('windicss/plugin')(({ addUtilities, addComponents, theme }) => {
      
      // 접근성 유틸리티
      addUtilities({
        '.sr-only': {
          position: 'absolute',
          width: '1px',
          height: '1px',
          padding: '0',
          margin: '-1px',
          overflow: 'hidden',
          clip: 'rect(0, 0, 0, 0)',
          whiteSpace: 'nowrap',
          border: '0'
        },
        
        '.focus-visible': {
          '&:focus-visible': {
            outline: '2px solid #0ea5e9',
            outlineOffset: '2px',
            borderRadius: '0.375rem'
          }
        }
      })

      // 컴포넌트 스타일
      addComponents({
        '.scrollbar-thin': {
          scrollbarWidth: 'thin',
          '&::-webkit-scrollbar': {
            width: '6px'
          },
          '&::-webkit-scrollbar-track': {
            background: '#f1f5f9',
            borderRadius: '3px'
          },
          '&::-webkit-scrollbar-thumb': {
            background: '#cbd5e1',
            borderRadius: '3px',
            '&:hover': {
              background: '#0ea5e9'
            }
          }
        },
        
        '.glass': {
          background: 'rgba(255, 255, 255, 0.2)',
          backdropFilter: 'blur(10px)',
          border: '1px solid rgba(255, 255, 255, 0.3)'
        },
        
        '.text-balance': {
          textWrap: 'balance'
        }
      })
    })
  ],

  // 변형자 (Variants) - 상태별 스타일링
  variants: {
    extend: {
      backgroundColor: ['active', 'disabled'],
      textColor: ['active', 'disabled'],
      opacity: ['disabled'],
      cursor: ['disabled'],
      boxShadow: ['active']
    }
  },

  // 불필요한 CSS 제거를 위한 PurgeCSS 설정
  purge: {
    enabled: process.env.NODE_ENV === 'production',
    content: [
      './index.html',
      './src/**/*.{vue,js,ts,jsx,tsx}'
    ],
    options: {
      safelist: [
        'html',
        'body',
        /-(leave|enter|appear)(|-(to|from|active))$/,
        /^(?!cursor-move).+-move$/,
        /^router-link(|-exact)-active$/,
        /data-v-.*/
      ]
    }
  }
})