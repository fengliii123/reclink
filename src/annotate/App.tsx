import { useEffect, useRef, useState } from 'react'
import { deleteRecording, getRecordingBlob, saveRecording } from '../media/store'
import { getMeta } from '../media/db'
import { recordingFilename } from '../shared/constants'
import { t } from '../shared/i18n'

type Tool = 'rect' | 'arrow' | 'pen' | 'text' | 'mosaic'

interface Pt {
  x: number
  y: number
}

type Op =
  | { type: 'rect'; x: number; y: number; w: number; h: number; color: string; width: number }
  | { type: 'arrow'; x1: number; y1: number; x2: number; y2: number; color: string; width: number }
  | { type: 'pen'; points: Pt[]; color: string; width: number }
  | { type: 'text'; x: number; y: number; text: string; color: string; size: number }
  | { type: 'mosaic'; x: number; y: number; w: number; h: number }

const TOOLS: { tool: Tool; labelKey: string; glyph: string }[] = [
  { tool: 'rect', labelKey: 'anRect', glyph: '▭' },
  { tool: 'arrow', labelKey: 'anArrow', glyph: '➤' },
  { tool: 'pen', labelKey: 'anPen', glyph: '✎' },
  { tool: 'text', labelKey: 'anText', glyph: 'T' },
  { tool: 'mosaic', labelKey: 'anMosaic', glyph: '▦' },
]

const COLORS = ['#e53935', '#fb8c00', '#fdd835', '#1e88e5', '#111827', '#ffffff']
const WIDTHS = [3, 5, 9]

function drawArrowHead(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number, color: string, width: number) {
  const angle = Math.atan2(y2 - y1, x2 - x1)
  const head = Math.max(12, width * 3.2)
  ctx.strokeStyle = color
  ctx.lineWidth = width
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(x2, y2)
  ctx.lineTo(x2 - head * Math.cos(angle - Math.PI / 6), y2 - head * Math.sin(angle - Math.PI / 6))
  ctx.moveTo(x2, y2)
  ctx.lineTo(x2 - head * Math.cos(angle + Math.PI / 6), y2 - head * Math.sin(angle + Math.PI / 6))
  ctx.stroke()
}

function drawOp(ctx: CanvasRenderingContext2D, base: HTMLCanvasElement, op: Op) {
  if (op.type === 'rect') {
    ctx.strokeStyle = op.color
    ctx.lineWidth = op.width
    ctx.strokeRect(op.x, op.y, op.w, op.h)
  } else if (op.type === 'arrow') {
    ctx.strokeStyle = op.color
    ctx.lineWidth = op.width
    ctx.lineCap = 'round'
    ctx.beginPath()
    ctx.moveTo(op.x1, op.y1)
    ctx.lineTo(op.x2, op.y2)
    ctx.stroke()
    drawArrowHead(ctx, op.x1, op.y1, op.x2, op.y2, op.color, op.width)
  } else if (op.type === 'pen') {
    ctx.strokeStyle = op.color
    ctx.lineWidth = op.width
    ctx.lineJoin = 'round'
    ctx.lineCap = 'round'
    ctx.beginPath()
    op.points.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)))
    ctx.stroke()
  } else if (op.type === 'text') {
    ctx.fillStyle = op.color
    ctx.font = `bold ${op.size}px -apple-system, 'PingFang SC', 'Microsoft YaHei', sans-serif`
    ctx.textBaseline = 'top'
    op.text.split('\n').forEach((line, i) => ctx.fillText(line, op.x, op.y + i * op.size * 1.25))
  } else if (op.type === 'mosaic') {
    // 缩小再放大 = 像素化；从底图取样避免叠加马赛克互相污染
    const factor = 14
    const tmp = document.createElement('canvas')
    tmp.width = Math.max(1, Math.round(op.w / factor))
    tmp.height = Math.max(1, Math.round(op.h / factor))
    const tctx = tmp.getContext('2d')!
    tctx.drawImage(base, op.x, op.y, op.w, op.h, 0, 0, tmp.width, tmp.height)
    ctx.imageSmoothingEnabled = false
    ctx.drawImage(tmp, 0, 0, tmp.width, tmp.height, op.x, op.y, op.w, op.h)
    ctx.imageSmoothingEnabled = true
  }
}

export default function App() {
  const id = new URLSearchParams(location.search).get('id')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [createdAt, setCreatedAt] = useState<number>(Date.now())
  const [tool, setTool] = useState<Tool>('rect')
  const [color, setColor] = useState(COLORS[0])
  const [width, setWidth] = useState(WIDTHS[1])
  const [ops, setOps] = useState<Op[]>([])
  const [saving, setSaving] = useState(false)
  const [savedId, setSavedId] = useState<string | null>(null)
  const [textInput, setTextInput] = useState<{ x: number; y: number; value: string } | null>(null)

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const baseRef = useRef<HTMLCanvasElement | null>(null)
  const opsRef = useRef<Op[]>([])
  const drawing = useRef<{ start: Pt; pen: Pt[] } | null>(null)
  const textAreaRef = useRef<HTMLTextAreaElement>(null)

  opsRef.current = ops

  // 载入底图
  useEffect(() => {
    void (async () => {
      try {
        if (!id) throw new Error(t('anMissingId'))
        const meta = await getMeta(id)
        if (!meta) throw new Error(t('anNotFound'))
        setCreatedAt(meta.createdAt)
        const blob = await getRecordingBlob(id)
        const bmp = await createImageBitmap(blob)
        const base = document.createElement('canvas')
        base.width = bmp.width
        base.height = bmp.height
        base.getContext('2d')!.drawImage(bmp, 0, 0)
        bmp.close()
        baseRef.current = base
        const canvas = canvasRef.current!
        canvas.width = base.width
        canvas.height = base.height
        redraw()
        setLoading(false)
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e))
        setLoading(false)
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  const redraw = (previewOp?: Op) => {
    const canvas = canvasRef.current
    const base = baseRef.current
    if (!canvas || !base) return
    const ctx = canvas.getContext('2d')!
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(base, 0, 0)
    for (const op of opsRef.current) drawOp(ctx, base, op)
    if (previewOp) drawOp(ctx, base, previewOp)
  }

  /** 鼠标事件坐标 → 画布像素坐标 */
  const toCanvasPt = (e: React.MouseEvent): Pt => {
    const canvas = canvasRef.current!
    const rect = canvas.getBoundingClientRect()
    return {
      x: ((e.clientX - rect.left) / rect.width) * canvas.width,
      y: ((e.clientY - rect.top) / rect.height) * canvas.height,
    }
  }

  const previewFromDrawing = (): Op | null => {
    const d = drawing.current
    if (!d) return null
    if (tool === 'pen') return { type: 'pen', points: d.pen, color, width }
    const x = Math.min(d.start.x, d.pen[d.pen.length - 1].x)
    const y = Math.min(d.start.y, d.pen[d.pen.length - 1].y)
    const w = Math.abs(d.pen[d.pen.length - 1].x - d.start.x)
    const h = Math.abs(d.pen[d.pen.length - 1].y - d.start.y)
    if (tool === 'rect') return { type: 'rect', x, y, w, h, color, width }
    if (tool === 'mosaic') return { type: 'rect', x, y, w, h, color: '#ffffff', width: 1 }
    return { type: 'arrow', x1: d.start.x, y1: d.start.y, x2: d.pen[d.pen.length - 1].x, y2: d.pen[d.pen.length - 1].y, color, width }
  }

  const onMouseDown = (e: React.MouseEvent) => {
    if (tool === 'text') {
      commitText()
      setTextInput({ ...toCanvasPt(e), value: '' })
      requestAnimationFrame(() => textAreaRef.current?.focus())
      return
    }
    const p = toCanvasPt(e)
    drawing.current = { start: p, pen: [p] }
  }

  const onMouseMove = (e: React.MouseEvent) => {
    if (!drawing.current) return
    drawing.current.pen.push(toCanvasPt(e))
    redraw(previewFromDrawing() ?? undefined)
  }

  const onMouseUp = () => {
    const op = previewFromDrawing()
    drawing.current = null
    if (!op) return
    if ((op.type === 'rect' || op.type === 'arrow') && (('x' in op && op.w < 6) || ('x1' in op && Math.hypot(op.x2 - op.x1, op.y2 - op.y1) < 6))) return
    if (op.type === 'rect' && tool === 'mosaic') {
      setOps((prev) => [...prev, { type: 'mosaic', x: op.x, y: op.y, w: op.w, h: op.h }])
    } else {
      setOps((prev) => [...prev, op])
    }
  }

  useEffect(() => {
    redraw()
  }, [ops])

  const commitText = () => {
    if (!textInput || !textInput.value.trim()) return
    const size = Math.max(20, Math.round((canvasRef.current?.width ?? 1200) / 45))
    setOps((prev) => [...prev, { type: 'text', x: textInput.x, y: textInput.y, text: textInput.value.trim(), color, size }])
    setTextInput(null)
  }

  const undo = () => setOps((prev) => prev.slice(0, -1))

  const outputBlob = async (): Promise<Blob> => {
    const canvas = canvasRef.current!
    return new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error(t('anPngFailed')))), 'image/png'),
    )
  }

  const download = async () => {
    const blob = await outputBlob()
    const url = URL.createObjectURL(blob)
    await chrome.downloads.download({
      url,
      filename: recordingFilename('screenshot', createdAt, 'image/png'),
      conflictAction: 'uniquify',
    })
    setTimeout(() => URL.revokeObjectURL(url), 60_000)
  }

  /** 标注结果另存为新条目（不动原图），SW 会打开新的完成页 */
  const saveToLibrary = async () => {
    if (saving) return
    setSaving(true)
    try {
      const blob = await outputBlob()
      const newId = await saveRecording({ mode: 'screenshot', createdAt: Date.now(), durationMs: 0, blob })
      setSavedId(newId)
      await chrome.runtime.sendMessage({ type: 'SHOT_SAVED', recordingId: newId })
      window.close()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setSaving(false)
    }
  }

  const removeOriginal = async () => {
    if (!id) return
    await deleteRecording(id)
  }

  const canvasW = canvasRef.current?.width ?? 0
  const canvasH = canvasRef.current?.height ?? 1

  return (
    <div className="annotate-page">
      <header className="toolbar">
        <div className="tool-group">
          {TOOLS.map(({ tool: tKey, labelKey, glyph }) => (
            <button key={tKey} className={`tool-btn ${tool === tKey ? 'active' : ''}`} title={t(labelKey)} onClick={() => setTool(tKey)}>
              <span className="glyph">{glyph}</span>
            </button>
          ))}
        </div>
        <div className="tool-group">
          {COLORS.map((c) => (
            <button key={c} className={`swatch ${color === c ? 'active' : ''}`} style={{ background: c }} onClick={() => setColor(c)} />
          ))}
        </div>
        <div className="tool-group">
          {WIDTHS.map((w) => (
            <button key={w} className={`width-btn ${width === w ? 'active' : ''}`} onClick={() => setWidth(w)}>
              <span className="dot" style={{ width: w + 4, height: w + 4 }} />
            </button>
          ))}
        </div>
        <div className="spacer" />
        <button className="act-btn ghost" onClick={undo} disabled={!ops.length}>
          {t('anUndo')}
        </button>
        <button className="act-btn ghost" onClick={() => setOps([])} disabled={!ops.length}>
          {t('anClear')}
        </button>
      </header>

      <div className="canvas-wrap">
        {loading && <div className="tip">{t('loading')}</div>}
        {error && <div className="tip error">{error}</div>}
        <canvas
          ref={canvasRef}
          className="editor"
          hidden={loading || !!error}
          onMouseDown={onMouseDown}
          onMouseMove={onMouseMove}
          onMouseUp={onMouseUp}
          onMouseLeave={onMouseUp}
          style={{ cursor: tool === 'text' ? 'text' : 'crosshair' }}
        />
        {textInput && (
          <textarea
            ref={textAreaRef}
            className="text-input"
            style={{
              left: `${(textInput.x / canvasW) * 100}%`,
              top: `${(textInput.y / canvasH) * 100}%`,
              color,
              fontSize: Math.max(14, Math.round((canvasW || 1200) / 45)),
            }}
            value={textInput.value}
            placeholder={t('anTextPh')}
            onChange={(e) => setTextInput({ ...textInput, value: e.target.value })}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) commitText()
              if (e.key === 'Escape') setTextInput(null)
            }}
            onBlur={commitText}
          />
        )}
      </div>

      <footer className="actions">
        {error ? (
          <button className="act-btn ghost" onClick={() => window.close()}>
            {t('close')}
          </button>
        ) : (
          <>
            <button className="act-btn ghost" onClick={() => void download()}>
              {t('anDownloadPng')}
            </button>
            <button className="act-btn ghost danger" onClick={() => void removeOriginal()} disabled={!id}>
              {t('anDeleteOrig')}
            </button>
            <button className="act-btn primary" onClick={() => void saveToLibrary()} disabled={saving || loading}>
              {saving ? t('anSaving') : t('anSave')}
            </button>
          </>
        )}
        {savedId && <span className="saved-tip">{t('anSaved')}</span>}
      </footer>
    </div>
  )
}
