/// <reference types="node" />
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { crx } from '@crxjs/vite-plugin'
import manifest from './manifest.config'

export default defineConfig({
  plugins: [react(), crx({ manifest })],
  build: {
    rollupOptions: {
      input: {
        // offscreen.html / library 页不在 manifest 入口字段中（offscreen 由
        // chrome.offscreen.createDocument 动态创建，library 用 tabs.create 打开），
        // 需要作为额外 HTML 入口让 Vite 处理其中的模块脚本
        offscreen: fileURLToPath(new URL('./src/offscreen/offscreen.html', import.meta.url)),
        library: fileURLToPath(new URL('./src/library/index.html', import.meta.url)),
        recorderWindow: fileURLToPath(new URL('./src/recorder-window/index.html', import.meta.url)),
        complete: fileURLToPath(new URL('./src/complete/index.html', import.meta.url)),
        annotate: fileURLToPath(new URL('./src/annotate/index.html', import.meta.url)),
        ocr: fileURLToPath(new URL('./src/ocr/index.html', import.meta.url)),
      },
    },
  },
})
