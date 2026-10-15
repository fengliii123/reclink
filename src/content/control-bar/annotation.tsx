import { useEffect, useRef } from 'react'

/**
 * 录制中实时批注层：固定全视口 canvas，画笔/矩形/箭头 + 颜色。
 * 画面随页面一起被屏幕/标签页捕获"光学烧录"进视频（与 AS 同原理），
 * 不经过录制管线。仅视口坐标系（页面滚动时批注随视口固定，AS 同款行为）。
 *
 * 事件用 window 捕获阶段的原生监听（而非 React 合成事件）：重型站点常在
 * document/window 上捕获并吞掉 pointer 事件，气泡到画布前就没了——捕获
 * 阶段 window 是第一站，先于任何站点脚本拿到事件。
 */

export type AnnoTool = 'pen' | 'rect' | 'arrow' | 'eraser'

/** 光标效果：聚光灯（页面变暗照亮光标周围）/ 圆环跟随 / 遮挡（光标周围隐藏内容） */
export type CursorFx = 'none' | 'spotlight' | 'ring' | 'patch'

interface Op {
  tool: AnnoTool
  color: string
  width: number
  /** pen 专用 */
  points?: Array<[number, number]>
  /** rect/arrow 专用 */
  x0?: number
  y0?: number
  x1?: number
  y1?: number
}

/** 点是否命中某个批注（橡皮删除用，容差 12px；矩形按框内/框边） */
function hitOp(op: Op, x: number, y: number): boolean {
  const TOL = 12
  if (op.tool === 'pen') {
    return op.points!.some(([qx, qy]) => (qx - x) ** 2 + (qy - y) ** 2 <= TOL * TOL)
  }
  if (op.tool === 'rect') {
    const l = Math.min(op.x0!, op.x1!) - TOL
    const r = Math.max(op.x0!, op.x1!) + TOL
    const tp = Math.min(op.y0!, op.y1!) - TOL
    const b = Math.max(op.y0!, op.y1!) + TOL
    return x >= l && x <= r && y >= tp && y <= b
  }
  // 点到箭头线段的距离
  const x0 = op.x0!
  const y0 = op.y0!
  const x1 = op.x1!
  const y1 = op.y1!
  const dx = x1 - x0
  const dy = y1 - y0
  const len2 = dx * dx + dy * dy
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((x - x0) * dx + (y - y0) * dy) / len2))
  const px = x0 + t * dx
  const py = y0 + t * dy
  return (px - x) ** 2 + (py - y) ** 2 <= TOL * TOL
}

function drawOp(ctx: CanvasRenderingContext2D, op: Op): void {
  ctx.strokeStyle = op.color
  ctx.fillStyle = op.color
  ctx.lineWidth = op.width
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  if (op.tool === 'pen') {
    const pts = op.points!
    ctx.beginPath()
    ctx.moveTo(pts[0][0], pts[0][1])
    // 中点二次贝塞尔平滑（消除折线感）
    for (let i = 1; i < pts.length - 1; i++) {
      const mx = (pts[i][0] + pts[i + 1][0]) / 2
      const my = (pts[i][1] + pts[i + 1][1]) / 2
      ctx.quadraticCurveTo(pts[i][0], pts[i][1], mx, my)
    }
    const last = pts[pts.length - 1]
    ctx.lineTo(last[0] + 0.01, last[1] + 0.01)
    ctx.stroke()
  } else if (op.tool === 'rect') {
    ctx.strokeRect(
      Math.min(op.x0!, op.x1!),
      Math.min(op.y0!, op.y1!),
      Math.abs(op.x1! - op.x0!),
      Math.abs(op.y1! - op.y0!),
    )
  } else {
    const { x0, y0, x1, y1 } = op
    ctx.beginPath()
    ctx.moveTo(x0!, y0!)
    ctx.lineTo(x1!, y1!)
    ctx.stroke()
    const ang = Math.atan2(y1! - y0!, x1! - x0!)
    const head = 15
    ctx.beginPath()
    ctx.moveTo(x1!, y1!)
    ctx.lineTo(x1! - head * Math.cos(ang - Math.PI / 6), y1! - head * Math.sin(ang - Math.PI / 6))
    ctx.moveTo(x1!, y1!)
    ctx.lineTo(x1! - head * Math.cos(ang + Math.PI / 6), y1! - head * Math.sin(ang + Math.PI / 6))
    ctx.stroke()
  }
}

export default function AnnotationCanvas({
  tool,
  color,
  clearTick,
  cursorFx,
}: {
  tool: AnnoTool | null
  color: string
  clearTick: number
  cursorFx: CursorFx
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const opsRef = useRef<Op[]>([])
  const draftRef = useRef<Op | null>(null)
  const toolRef = useRef<AnnoTool | null>(tool)
  const erasingRef = useRef(false)
  const colorRef = useRef(color)
  const fxRef = useRef<CursorFx>(cursorFx)
  const mouseRef = useRef<[number, number]>([-999, -999])
  toolRef.current = tool
  colorRef.current = color
  fxRef.current = cursorFx

  const redraw = () => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    // 光标效果画在批注下层（聚光灯孔洞内的批注保持可见）
    const fx = fxRef.current
    const [mx, my] = mouseRef.current
    if (fx !== 'none' && mx > -900) {
      if (fx === 'spotlight') {
        ctx.save()
        ctx.fillStyle = 'rgba(0, 0, 0, 0.55)'
        ctx.fillRect(0, 0, canvas.width, canvas.height)
        // 在光标处掏一个柔和的透明圆
        const r = 150
        const g = ctx.createRadialGradient(mx, my, r * 0.55, mx, my, r)
        g.addColorStop(0, 'rgba(0,0,0,1)')
        g.addColorStop(1, 'rgba(0,0,0,0)')
        ctx.globalCompositeOperation = 'destination-out'
        ctx.fillStyle = g
        ctx.beginPath()
        ctx.arc(mx, my, r, 0, Math.PI * 2)
        ctx.fill()
        ctx.restore()
      } else if (fx === 'ring') {
        ctx.save()
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)'
        ctx.lineWidth = 3
        ctx.shadowColor = 'rgba(59, 130, 246, 0.9)'
        ctx.shadowBlur = 10
        ctx.beginPath()
        ctx.arc(mx, my, 24, 0, Math.PI * 2)
        ctx.stroke()
        ctx.restore()
      } else if (fx === 'patch') {
        ctx.save()
        const r = 110
        const g = ctx.createRadialGradient(mx, my, r * 0.45, mx, my, r)
        g.addColorStop(0, 'rgba(18, 18, 20, 0.96)')
        g.addColorStop(0.8, 'rgba(18, 18, 20, 0.9)')
        g.addColorStop(1, 'rgba(18, 18, 20, 0)')
        ctx.fillStyle = g
        ctx.beginPath()
        ctx.arc(mx, my, r, 0, Math.PI * 2)
        ctx.fill()
        ctx.restore()
      }
    }
    for (const op of opsRef.current) drawOp(ctx, op)
    if (draftRef.current) drawOp(ctx, draftRef.current)
    canvas.dataset.ops = String(opsRef.current.length)
    canvas.dataset.fx = fx
  }

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')!

    const fit = () => {
      const dpr = window.devicePixelRatio || 1
      // 必须显式设置 CSS 尺寸：替换元素（canvas）在 inset:0 + width:auto 下
      // 会按画布属性尺寸（物理像素）显示，Retina 上比视口大 dpr 倍 → 笔迹坐标整体偏移
      canvas.style.width = `${window.innerWidth}px`
      canvas.style.height = `${window.innerHeight}px`
      canvas.width = Math.round(window.innerWidth * dpr)
      canvas.height = Math.round(window.innerHeight * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      redraw()
    }
    window.addEventListener('resize', fit)
    fit()

    const startDraft = (x: number, y: number) => {
      const t = toolRef.current
      if (!t) return
      const op: Op = { tool: t, color: colorRef.current, width: 5 }
      if (t === 'pen') {
        op.points = [[x, y]]
      } else {
        op.x0 = x
        op.y0 = y
        op.x1 = x
        op.y1 = y
      }
      draftRef.current = op
    }

    const eraseAt = (x: number, y: number) => {
      for (let i = opsRef.current.length - 1; i >= 0; i--) {
        if (hitOp(opsRef.current[i], x, y)) {
          opsRef.current.splice(i, 1)
          redraw()
          return
        }
      }
    }

    const onDown = (e: PointerEvent) => {
      // 工具未激活不画；工具栏（本组件 shadow 内除画布外的部分）不画。
      // window 监听器位于 shadow tree 之外，e.target 已被重定向为宿主元素，
      // 必须用 composedPath 取真实目标；画布被站点悬浮层遮挡时目标为站点
      // 元素，同样照画（capture 阶段先于站点脚本）
      if (!toolRef.current || (e.pointerType === 'mouse' && e.button !== 0)) return
      const path = e.composedPath()
      const realTarget = path[0]
      if (realTarget !== canvas && path.includes(canvas.getRootNode() as EventTarget)) return
      e.preventDefault()
      e.stopPropagation()
      if (toolRef.current === 'eraser') {
        erasingRef.current = true
        try {
          canvas.setPointerCapture(e.pointerId)
        } catch {
          // 忽略
        }
        eraseAt(e.clientX, e.clientY)
        return
      }
      startDraft(e.clientX, e.clientY)
      try {
        canvas.setPointerCapture(e.pointerId)
      } catch {
        // 个别环境下 capture 不可用，仍可绘制（move 时以 draft 为准）
      }
      redraw()
    }

    const onMove = (e: PointerEvent) => {
      if (erasingRef.current) {
        e.preventDefault()
        e.stopPropagation()
        eraseAt(e.clientX, e.clientY)
        return
      }
      const op = draftRef.current
      if (!op) return
      e.preventDefault()
      e.stopPropagation()
      if (op.tool === 'pen') {
        op.points!.push([e.clientX, e.clientY])
      } else {
        op.x1 = e.clientX
        op.y1 = e.clientY
      }
      redraw()
    }

    const onUp = () => {
      erasingRef.current = false
      if (!draftRef.current) return
      opsRef.current.push(draftRef.current)
      draftRef.current = null
      redraw()
    }

    window.addEventListener('pointerdown', onDown, true)
    window.addEventListener('pointermove', onMove, true)
    window.addEventListener('pointerup', onUp, true)
    window.addEventListener('pointercancel', onUp, true)

    // 光标效果跟随：全局鼠标位置追踪 + rAF 节流重绘
    let fxRaf = 0
    const onFxMove = (e: PointerEvent) => {
      if (fxRef.current === 'none') return
      mouseRef.current = [e.clientX, e.clientY]
      if (!fxRaf) {
        fxRaf = requestAnimationFrame(() => {
          fxRaf = 0
          redraw()
        })
      }
    }
    window.addEventListener('pointermove', onFxMove, { capture: true, passive: true })

    return () => {
      window.removeEventListener('resize', fit)
      window.removeEventListener('pointerdown', onDown, true)
      window.removeEventListener('pointermove', onMove, true)
      window.removeEventListener('pointerup', onUp, true)
      window.removeEventListener('pointercancel', onUp, true)
      window.removeEventListener('pointermove', onFxMove, true)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 切换光标效果时立即重绘
  useEffect(() => {
    redraw()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cursorFx])

  useEffect(() => {
    opsRef.current = []
    draftRef.current = null
    redraw()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clearTick])

  return (
    <canvas
      ref={canvasRef}
      className={`anno-canvas ${tool ? 'active' : ''} ${tool === 'eraser' ? 'eraser' : ''}`}
      data-ops="0"
    />
  )

}
