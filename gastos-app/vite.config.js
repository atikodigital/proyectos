import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  define: {
    // Makes __VITE_API_BASE__ available in source (falls back to env var or undefined)
    __VITE_API_BASE__: JSON.stringify(process.env.VITE_API_BASE || ''),
    __KALY_LIVE_MODEL__: JSON.stringify(process.env.KALY_LIVE_MODEL || 'gemini-2.5-flash-native-audio-preview-09-2025'),
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    host: true,
    proxy: {
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true
      },
      '/uploads': {
        target: 'http://localhost:5000',
        changeOrigin: true
      },
      '/webhook': {
        target: 'http://localhost:5000',
        changeOrigin: true
      },
      '/webhook-test': {
        target: 'http://localhost:5000',
        changeOrigin: true
      }
    }
  }
})
