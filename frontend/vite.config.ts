/// <reference types="vitest/config" />
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'

const here = (p: string) => fileURLToPath(new URL(p, import.meta.url))

// Two websites from one codebase: the Buildora website (default) and the admin website (`--mode admin`), each with its own
// address, page and build folder. They share components, the login and the API client.
export default defineConfig(({ mode }) => {
  const admin = mode === 'admin'
  return {
    plugins: [react(), tailwindcss()],
    resolve: { alias: { '@': here('./src') } },
    root: admin ? here('./admin') : undefined,
    envDir: here('.'), // .env.local lives next to this file for both websites
    publicDir: here('./public'),
    build: admin ? { outDir: here('./dist-admin'), emptyOutDir: true } : undefined,
    server: {
      port: admin ? 5174 : 5173,
      // Local development: the browser calls /api on this server and Vite forwards it to the FastAPI backend.
      proxy: { '/api': { target: process.env.BACKEND_URL ?? 'http://localhost:8000', changeOrigin: true } },
    },
    test: { environment: 'jsdom', setupFiles: [here('./src/test/setup.ts')], css: false },
  }
})
