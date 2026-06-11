import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react' // Corrigido aqui!
import tailwindcss from '@tailwindcss/vite'

// https://vitejs.dev/config/
export default defineConfig({
  base:"/BolaoCopa/",
  plugins: [
    react(),
    tailwindcss(),
  ],
})