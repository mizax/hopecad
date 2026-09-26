/// <reference types="vitest/config" />
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'
import { viteSingleFile } from 'vite-plugin-singlefile'

// `vite build --mode single` собирает один самодостаточный hopecad.html
export default defineConfig(({ mode }) => ({
  base: './',
  plugins: mode === 'single' ? [vue(), viteSingleFile()] : [vue()],
  build: mode === 'single' ? { outDir: 'dist-single', emptyOutDir: true } : {},
  test: { include: ['src/**/*.test.ts'] },
}))
