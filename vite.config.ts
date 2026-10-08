import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  base: '/final-year-.5/',
  plugins: [react()],
  server: { port: 5173 },
})