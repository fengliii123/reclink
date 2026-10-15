/**
 * Canvas 实时合成器：主画面（屏幕/标签页）+ 可选裁剪 + 可选摄像头气泡。
 * 输出单条合成视频轨（canvas.captureStream），供 MediaRecorder 使用。
 * 运行在录制宿主页面（offscreen 文档或 screen-picker 标签页）。
 */

export interface CropRect {
  /** 页面视口 CSS 像素坐标 */
  x: number
  y: number
  width: number
  height: number
}

export class StreamCompositor {
  readonly canvas = document.createElement('canvas')
  private ctx: CanvasRenderingContext2D
  private mainVideo = document.createElement('video')
  private camVideo: HTMLVideoElement | null = null
  private camStream: MediaStream | null = null
  private raf = 0
  private hiddenTimer = 0
  private crop: CropRect | null
  private viewportWidth: number
  private disposed = false
  private outTrack: MediaStreamTrack | null = null

  constructor(mainTrack: MediaStreamTrack, crop: CropRect | null, viewportWidth: number) {
    this.crop = crop
    this.viewportWidth = viewportWidth
    this.ctx = this.canvas.getContext('2d', { willReadFrequently: false })!
    this.mainVideo.muted = true
    this.mainVideo.playsInline = true
    this.mainVideo.srcObject = new MediaStream([mainTrack])
    void this.mainVideo.play().catch(() => {})
    this.loop()
    // 宿主页面隐藏/最小化时 rAF 停止（画面会冻结），降级用 timer 驱动绘制。
    // offscreen 文档生来即 hidden 且不会触发 visibilitychange，需初始化时自查
    document.addEventListener('visibilitychange', this.onVisibility)
    if (document.hidden) this.onVisibility()
  }

  private onVisibility = (): void => {
    if (this.disposed) return
    if (document.hidden) {
      cancelAnimationFrame(this.raf)
      if (!this.hiddenTimer) this.hiddenTimer = window.setInterval(() => this.draw(), 100)
    } else {
      if (this.hiddenTimer) {
        window.clearInterval(this.hiddenTimer)
        this.hiddenTimer = 0
      }
      cancelAnimationFrame(this.raf)
      this.loop()
    }
  }

  /** 合成后的视频轨（幂等） */
  get track(): MediaStreamTrack {
    if (!this.outTrack) {
      this.outTrack = this.canvas.captureStream(30).getVideoTracks()[0]
    }
    return this.outTrack
  }

  async enableCamera(): Promise<MediaStream> {
    if (this.disposed) throw new Error('compositor disposed')
    if (this.camStream) return this.camStream
    this.camStream = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' },
    })
    this.camVideo = document.createElement('video')
    this.camVideo.muted = true
    this.camVideo.playsInline = true
    this.camVideo.srcObject = this.camStream
    void this.camVideo.play().catch(() => {})
    return this.camStream
  }

  disableCamera(): void {
    this.camStream?.getTracks().forEach((t) => t.stop())
    this.camStream = null
    if (this.camVideo) {
      this.camVideo.srcObject = null
      this.camVideo = null
    }
  }

  get cameraEnabled(): boolean {
    return this.camStream != null
  }

  private loop = (): void => {
    if (this.disposed) return
    this.draw()
    this.raf = requestAnimationFrame(this.loop)
  }

  private draw(): void {
    const vw = this.mainVideo.videoWidth
    const vh = this.mainVideo.videoHeight
    if (!vw || !vh) return

    // crop 以页面视口 CSS 像素表达，换算到视频像素
    const scale = vw / this.viewportWidth
    const sx = this.crop ? this.crop.x * scale : 0
    const sy = this.crop ? this.crop.y * scale : 0
    const sw = this.crop ? this.crop.width * scale : vw
    const sh = this.crop ? this.crop.height * scale : vh
    if (!sw || !sh) return

    const outW = Math.round(sw)
    const outH = Math.round(sh)
    if (this.canvas.width !== outW || this.canvas.height !== outH) {
      this.canvas.width = outW
      this.canvas.height = outH
    }

    this.ctx.drawImage(this.mainVideo, sx, sy, sw, sh, 0, 0, outW, outH)

    // 摄像头气泡：右下角圆形、镜像、带描边
    const cam = this.camVideo
    if (cam && cam.videoWidth) {
      const cw = this.camStream?.getVideoTracks()[0]?.getSettings().width ?? cam.videoWidth
      const ch = this.camStream?.getVideoTracks()[0]?.getSettings().height ?? cam.videoHeight
      let bw = Math.max(Math.round(outW * 0.2), 140)
      bw = Math.min(bw, Math.round(outW * 0.4))
      const ratio = ch && cw ? ch / cw : 0.75
      const bh = Math.round(bw * ratio)
      const margin = Math.round(outW * 0.025)
      const cx = outW - bw - margin
      const cy = outH - bh - margin

      this.ctx.save()
      this.ctx.beginPath()
      this.ctx.arc(cx + bw / 2, cy + bh / 2, bw / 2, 0, Math.PI * 2)
      this.ctx.clip()
      this.ctx.translate(cx + bw, cy)
      this.ctx.scale(-1, 1) // 镜像，符合自拍预览习惯
      const srcAR = cam.videoWidth / cam.videoHeight
      const dstAR = bw / bh
      // cover 式裁剪绘制
      if (srcAR > dstAR) {
        const cut = cam.videoWidth - cam.videoWidth * (dstAR / srcAR)
        this.ctx.drawImage(cam, cut / 2, 0, cam.videoWidth - cut, cam.videoHeight, 0, 0, bw, bh)
      } else {
        const cut = cam.videoHeight - cam.videoHeight * (srcAR / dstAR)
        this.ctx.drawImage(cam, 0, cut / 2, cam.videoWidth, cam.videoHeight - cut, 0, 0, bw, bh)
      }
      this.ctx.restore()

      // 气泡描边
      this.ctx.beginPath()
      this.ctx.arc(cx + bw / 2, cy + bh / 2, bw / 2, 0, Math.PI * 2)
      this.ctx.lineWidth = Math.max(2, Math.round(outW * 0.004))
      this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)'
      this.ctx.stroke()
    }
  }

  destroy(): void {
    this.disposed = true
    document.removeEventListener('visibilitychange', this.onVisibility)
    cancelAnimationFrame(this.raf)
    if (this.hiddenTimer) {
      clearInterval(this.hiddenTimer)
      this.hiddenTimer = 0
    }
    this.disableCamera()
    this.mainVideo.srcObject = null
    this.track.stop()
  }
}
