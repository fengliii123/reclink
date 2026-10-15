/**
 * 把 tesseract.js 的 worker 与 wasm core 拷贝到 public/vendor，
 * 供 ocr 页以 chrome.runtime.getURL 引用（MV3 页面 CSP 不允许 blob worker，
 * 也不便走打包器）。语言包 traineddata 已直接提交在 public/vendor/tessdata。
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const outDir = path.join(root, 'public', 'vendor', 'tesseract')
fs.mkdirSync(outDir, { recursive: true })

const files = [
  ['tesseract.js/dist/worker.min.js', 'worker.min.js'],
  ['tesseract.js-core/tesseract-core-simd-lstm.wasm.js', 'tesseract-core-simd-lstm.wasm.js'],
  ['tesseract.js-core/tesseract-core-relaxedsimd-lstm.wasm.js', 'tesseract-core-relaxedsimd-lstm.wasm.js'],
]

for (const [from, to] of files) {
  fs.copyFileSync(path.join(root, 'node_modules', from), path.join(outDir, to))
  console.log('copied', to)
}
