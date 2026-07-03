import { defineConfig, loadEnv, type PluginOption } from 'vite'
import path from 'path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'

const TMAP_PROXY_TARGET = 'https://apis.openapi.sk.com'
const DATA_GO_KR_PROXY_TARGET = 'https://apis.data.go.kr'
const DEFAULT_SIGNAL_STDG_CD = '1100000000'

export default defineConfig(async ({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const tmapAppKey = env.TMAP_APP_KEY?.trim()
  const dataGoKrKey = env.DATA_GO_KR_KEY?.trim()
  const pwaPlugin = await createPwaPlugin()

  return {
    plugins: [
      // The React and Tailwind plugins are both required for Make, even if
      // Tailwind is not being actively used – do not remove them
      react(),
      tailwindcss(),
      pwaPlugin,
    ],
    resolve: {
      alias: {
        // Alias @ to the src directory
        '@': path.resolve(__dirname, './src'),
      },
    },
    server: {
      proxy: {
        '/api/tmap/pois': {
          target: TMAP_PROXY_TARGET,
          changeOrigin: true,
          secure: true,
          headers: tmapAppKey ? { appKey: tmapAppKey } : undefined,
          configure(proxy) {
            proxy.on('proxyReq', (proxyReq) => {
              if (tmapAppKey) {
                proxyReq.setHeader('appKey', tmapAppKey)
              }
            })
          },
          rewrite: (requestPath) => rewriteTmapPoisPath(requestPath),
        },
        '/api/tmap/transit': {
          target: TMAP_PROXY_TARGET,
          changeOrigin: true,
          secure: true,
          headers: tmapAppKey ? { appKey: tmapAppKey } : undefined,
          configure(proxy) {
            proxy.on('proxyReq', (proxyReq) => {
              if (tmapAppKey) {
                proxyReq.setHeader('appKey', tmapAppKey)
              }
            })
          },
          rewrite: () => '/transit/routes',
        },
        '/api/signal/crossroads': {
          target: DATA_GO_KR_PROXY_TARGET,
          changeOrigin: true,
          secure: true,
          rewrite: (requestPath) => rewriteSignalPath(requestPath, 'crsrd_map_info', dataGoKrKey),
        },
        '/api/signal/realtime': {
          target: DATA_GO_KR_PROXY_TARGET,
          changeOrigin: true,
          secure: true,
          rewrite: (requestPath) => rewriteSignalPath(requestPath, 'tl_drct_info', dataGoKrKey),
        },
      },
    },

    // File types to support raw imports. Never add .css, .tsx, or .ts files to this.
    assetsInclude: ['**/*.svg', '**/*.csv'],
  }
})

async function createPwaPlugin(): Promise<PluginOption> {
  try {
    const packageName = 'vite-plugin-pwa'
    const { VitePWA } = await import(packageName)

    return VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'BBARU — 정시 도착 최적화',
        short_name: 'BBARU',
        theme_color: '#2563EB',
        background_color: '#F8F9FB',
        display: 'standalone',
        lang: 'ko',
        start_url: '/',
        icons: [
          {
            src: '/icons/icon-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: '/icons/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: '/icons/icon-512-maskable.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        runtimeCaching: [
          {
            urlPattern: ({ url }: { url: URL }) => url.pathname.startsWith('/api/signal/'),
            handler: 'NetworkOnly',
            options: {
              cacheName: 'bbaru-signal-api',
            },
          },
          {
            urlPattern: ({ url }: { url: URL }) => url.pathname === '/api/tmap/pois',
            handler: 'NetworkFirst',
            options: {
              cacheName: 'bbaru-tmap-pois',
              networkTimeoutSeconds: 3,
              expiration: {
                maxEntries: 50,
                maxAgeSeconds: 60 * 60,
              },
            },
          },
        ],
      },
    })
  } catch (error) {
    const code = (error as { code?: string }).code
    const message = error instanceof Error ? error.message : ''

    if ((code === 'ERR_MODULE_NOT_FOUND' || code === 'MODULE_NOT_FOUND') && message.includes('vite-plugin-pwa')) {
      return null
    }

    throw error
  }
}

function rewriteTmapPoisPath(requestPath: string): string {
  const requestUrl = new URL(requestPath, 'http://localhost')
  const searchParams = new URLSearchParams({
    version: '1',
    searchKeyword: requestUrl.searchParams.get('q') ?? '',
    count: requestUrl.searchParams.get('count') ?? '5',
  })

  return `/tmap/pois?${searchParams.toString()}`
}

function rewriteSignalPath(
  requestPath: string,
  endpoint: 'crsrd_map_info' | 'tl_drct_info',
  serviceKey = '',
): string {
  const requestUrl = new URL(requestPath, 'http://localhost')
  const searchParams = new URLSearchParams({
    type: 'json',
    stdgCd: requestUrl.searchParams.get('stdgCd') ?? DEFAULT_SIGNAL_STDG_CD,
    pageNo: requestUrl.searchParams.get('pageNo') ?? '1',
    numOfRows: requestUrl.searchParams.get('numOfRows') ?? '1000',
  })

  return `/B551982/rti/${endpoint}?serviceKey=${encodeServiceKey(serviceKey)}&${searchParams.toString()}`
}

function encodeServiceKey(serviceKey: string): string {
  return /%[0-9A-Fa-f]{2}/.test(serviceKey) ? serviceKey : encodeURIComponent(serviceKey)
}
