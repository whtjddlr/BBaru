import { pathToFileURL } from 'url'
import { defineConfig, loadEnv, type Plugin } from 'vite'
import path from 'path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  Object.assign(process.env, env)

  return {
    base: './',
    envPrefix: ['VITE_', 'ODSAY_API_KEY'],
    plugins: [
      // The React and Tailwind plugins are both required for Make, even if
      // Tailwind is not being actively used – do not remove them
      react(),
      tailwindcss(),
      localApiPlugin(),
    ],
    resolve: {
      alias: {
        // Alias @ to the src directory
        '@': path.resolve(__dirname, './src'),
      },
    },

    // File types to support raw imports. Never add .css, .tsx, or .ts files to this.
    assetsInclude: ['**/*.svg', '**/*.csv'],
  }
})

function localApiPlugin(): Plugin {
  const apiRoutes: Record<string, string> = {
    '/api/ai/route-intent': './api/ai/route-intent.js',
    '/api/maps/geocode': './api/maps/geocode.js',
    '/api/mobility/odsay-route': './api/mobility/odsay-route.js',
    '/api/realtime-transit': './api/realtime-transit.js',
  }

  return {
    name: 'bbaru-local-api',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use(async (request, response, next) => {
        const requestUrl = new URL(request.url ?? '/', 'http://localhost')
        const routePath = apiRoutes[requestUrl.pathname]

        if (!routePath) {
          next()
          return
        }

        try {
          const moduleUrl = pathToFileURL(path.resolve(__dirname, routePath)).href
          const apiModule = await import(`${moduleUrl}?t=${Date.now()}`)
          const apiResponse = createApiResponse(response)

          await apiModule.default(request, apiResponse)
        } catch (error) {
          server.config.logger.error(error)

          if (!response.headersSent) {
            response.statusCode = 500
            response.setHeader('Content-Type', 'application/json; charset=utf-8')
            response.end(JSON.stringify({ error: 'local API handler failed' }))
          }
        }
      })
    },
  }
}

function createApiResponse(response: any) {
  return Object.assign(response, {
    status(statusCode: number) {
      response.statusCode = statusCode
      return this
    },
    json(payload: unknown) {
      if (!response.headersSent) {
        response.setHeader('Content-Type', 'application/json; charset=utf-8')
      }

      response.end(JSON.stringify(payload))
      return this
    },
  })
}
