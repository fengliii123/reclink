/**
 * 用 Web Audio 把多条音轨混合为一条（如标签页音频 + 麦克风）。
 */
export interface MixedAudio {
  track: MediaStreamTrack
  cleanup: () => void
}

export function mixAudioStreams(streams: MediaStream[]): MixedAudio {
  const ctx = new AudioContext()
  const dest = ctx.createMediaStreamDestination()
  const sources = streams.map((s) => ctx.createMediaStreamSource(s))
  for (const src of sources) {
    src.connect(dest)
  }
  return {
    track: dest.stream.getAudioTracks()[0],
    cleanup: () => {
      for (const src of sources) {
        src.disconnect()
      }
      void ctx.close().catch(() => {})
    },
  }
}

/**
 * 把捕获到的标签页/系统音频播放出来（tabCapture 会从原标签页移除声音，
 * 需要在 offscreen 里回放，用户才能继续听到）。
 */
export function playAudioOutLoud(stream: MediaStream): () => void {
  const el = document.createElement('audio')
  el.srcObject = new MediaStream(stream.getAudioTracks())
  el.autoplay = true
  void el.play().catch(() => {})
  return () => {
    el.pause()
    el.srcObject = null
    el.remove()
  }
}
