import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'

const repository = (globalThis as typeof globalThis & {
  process?: { env?: Record<string, string | undefined> }
}).process?.env?.GITHUB_REPOSITORY
const repoName = repository?.split('/')?.[1]
const base = repoName ? `/${repoName}/` : '/'

// https://vite.dev/config/
export default defineConfig({
  base,
  plugins: [react()],
  resolve: {
    alias: {
      'iconv-lite': fileURLToPath(
        new URL('./src/shims/iconv-lite.ts', import.meta.url)
      ),
    },
  },
})
