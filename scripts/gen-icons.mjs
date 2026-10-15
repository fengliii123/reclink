// Generate app icons (rounded square + record dot) without external deps.
// Usage: node scripts/gen-icons.mjs
import { deflateSync } from 'node:zlib'
import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const outDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'icons')

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})

function crc32(buf) {
  let c = 0xffffffff
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([len, body, crc])
}

function inRoundedRect(px, py, size, radius) {
  const dx = Math.max(radius - px, px - (size - radius), 0)
  const dy = Math.max(radius - py, py - (size - radius), 0)
  return dx * dx + dy * dy <= radius * radius
}

function makeIcon(size) {
  const bg = [6, 105, 255] // Vidline 品牌蓝 #0669FF
  const dot = [255, 255, 255]
  const radius = size * 0.24
  const dotR = size * 0.27
  const cx = size / 2
  const cy = size / 2
  const SS = 4 // supersample factor

  const raw = Buffer.alloc(size * (1 + size * 4))
  for (let y = 0; y < size; y++) {
    const rowStart = y * (1 + size * 4)
    raw[rowStart] = 0 // filter: none
    for (let x = 0; x < size; x++) {
      let bgHits = 0
      let dotHits = 0
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const px = x + (sx + 0.5) / SS
          const py = y + (sy + 0.5) / SS
          if (!inRoundedRect(px, py, size, radius)) continue
          bgHits++
          const ddx = px - cx
          const ddy = py - cy
          if (ddx * ddx + ddy * ddy <= dotR * dotR) dotHits++
        }
      }
      const total = SS * SS
      const i = rowStart + 1 + x * 4
      if (bgHits === 0) {
        raw[i + 3] = 0
        continue
      }
      const a = bgHits / total
      const dotA = dotHits / total
      raw[i] = Math.round(dot[0] * dotA + bg[0] * (1 - dotA))
      raw[i + 1] = Math.round(dot[1] * dotA + bg[1] * (1 - dotA))
      raw[i + 2] = Math.round(dot[2] * dotA + bg[2] * (1 - dotA))
      raw[i + 3] = Math.round(a * 255)
    }
  }

  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // color type RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

mkdirSync(outDir, { recursive: true })
for (const size of [16, 32, 48, 128]) {
  writeFileSync(join(outDir, `${size}.png`), makeIcon(size))
  console.log(`wrote icons/${size}.png`)
}
