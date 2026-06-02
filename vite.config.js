import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],

  // ─── Base path per GitHub Pages ───────────────────────────────
  // Il nome della repository è "journal" → l'app sarà su:
  // https://nevalexisbooks-ctrl.github.io/journal/
  base: '/journal/',
})
