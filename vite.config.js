import { defineConfig } from 'vite'
import { resolve } from 'path'

export default defineConfig({
  base: './',
  build: {
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname || '.', 'index.html'),
        transmit: resolve(import.meta.dirname || '.', 'transmit.html'),
      },
    },
  },
})

