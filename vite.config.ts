import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  /* Served from https://tommyclaffey.github.io/Growth/, so assets need the
     repo name as their base path. Without this, the built index.html asks for
     /assets/... at the domain root, gets GitHub's 404 page back, and renders
     blank with no console error that points at the cause. */
  base: '/Growth/',
})
