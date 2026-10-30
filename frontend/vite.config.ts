import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '')
  const runtimeEnv = (globalThis as typeof globalThis & { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {}
  const apiTarget = env.VITE_API_PROXY_TARGET || runtimeEnv.VITE_API_PROXY_TARGET || 'http://localhost:8000'
  return { plugins: [react()], server: { host: '0.0.0.0', proxy: { '/api': apiTarget } } }
})
