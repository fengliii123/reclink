import { RECORD_CANCELLED, type CropRect, type OffscreenStartMsg, type Resolution } from '../shared/messages'
import { mixAudioStreams, playAudioOutLoud } from './audio-mixer'
import { StreamCompositor } from './compositor'

export type { Resolution }

const RESOLUTIONS: Record<Resolution, { width: number; height: number }> = {
  '720p': { width: 1280, height: 720 },
  '1080p': { width: 1920, height: 1080 },
  '2160p': { width: 3840, height: 2160 },
}

export interface AssembledStream {
  /** 交给 MediaRecorder 的流 */
  stream: MediaStream
  /** 捕获得到的原始流（结束时统一 stop 所有轨道） */
  ownedStreams: MediaStream[]
  /** 混音器 / 回放等资源清理 */
  cleanup: () => void
  /** 启用合成管线（裁剪/人像气泡）时存在，用于录制中动态开关摄像头 */
  compositor?: StreamCompositor
  /** 麦克风轨（录制中静音/恢复开关用） */
  micTrack?: MediaStreamTrack
}

const noop = () => {}

// Chrome 捕获约束（chromeMediaSource）不在标准 MediaTrackConstraints 类型中
function chromeGetUserMedia(constraints: {
  audio?: boolean | Record<string, unknown>
  video?: boolean | Record<string, unknown>
}): Promise<MediaStream> {
  return navigator.mediaDevices.getUserMedia(constraints as unknown as MediaStreamConstraints)
}

export async function getCameraStream(micEnabled: boolean, resolution: Resolution): Promise<MediaStream> {
  const { width, height } = RESOLUTIONS[resolution]
  return navigator.mediaDevices.getUserMedia({
    video: { width: { ideal: width }, height: { ideal: height } },
    audio: micEnabled,
  })
}

async function getTabStream(streamId: string, resolution: Resolution): Promise<MediaStream> {
  const { width, height } = RESOLUTIONS[resolution]
  return chromeGetUserMedia({
    audio: {
      mandatory: { chromeMediaSource: 'tab', chromeMediaSourceId: streamId },
    },
    video: {
      mandatory: {
        chromeMediaSource: 'tab',
        chromeMediaSourceId: streamId,
        maxWidth: width,
        maxHeight: height,
      },
    },
  })
}

/**
 * 整屏捕获：offscreen 内直接 getDisplayMedia（Chrome 原生选源器，无扩展窗口）。
 * 不走 chooseDesktopMedia：其 streamId 与请求上下文绑定，SW 取到的 id
 * 无法在其他文档消费（Chromium 326509126），而 gUM 桌面约束又不能在
 * offscreen 弹选源器 —— getDisplayMedia 是 offscreen 唯一可行的整屏入口。
 * 用户在选源器勾选"分享系统音频"时流自动带音轨，未勾选返回纯视频。
 */
async function getDesktopStream(): Promise<MediaStream> {
  try {
    return await navigator.mediaDevices.getDisplayMedia({
      video: { displaySurface: 'monitor' },
      audio: true,
    })
  } catch (e) {
    const name = e instanceof DOMException ? e.name : ''
    if (name === 'NotAllowedError') {
      // 用户取消选源：与倒计时取消同语义（静默收场）
      throw new Error(RECORD_CANCELLED)
    }
    try {
      // 兜底：个别环境不接受 audio 声明，改为纯视频
      return await navigator.mediaDevices.getDisplayMedia({ video: true })
    } catch (e2) {
      const reason = e2 instanceof Error ? e2.message : String(e)
      throw new Error(
        `无法获取屏幕画面（${reason}）。macOS 请确认已在 系统设置 → 隐私与安全性 → 屏幕录制 中允许 Chrome`,
      )
    }
  }
}

async function getMicStream(): Promise<MediaStream> {
  return navigator.mediaDevices.getUserMedia({ audio: true })
}

/**
 * 按模式组装用于录制的 MediaStream：
 * - 有多个音源（标签页/系统音频 + 麦克风）时混合为单音轨
 * - tab/screen 捕获会接管音频，需在 offscreen 回放给用户
 */
export async function buildStream(msg: OffscreenStartMsg): Promise<AssembledStream> {
  switch (msg.mode) {
    case 'camera': {
      // camera 首次使用前由 recorder-window 授权窗完成过授权（扩展 origin 持久化），
      // offscreen 内 gUM 可静默成功；未授权时这里会失败并触发授权窗重试
      const raw = await getCameraStream(msg.micEnabled, msg.resolution)
      return {
        stream: raw,
        ownedStreams: [raw],
        cleanup: noop,
        micTrack: msg.micEnabled ? raw.getAudioTracks()[0] : undefined,
      }
    }
    case 'tab': {
      if (!msg.streamId) throw new Error('缺少 tab streamId')
      const raw = await getTabStream(msg.streamId, msg.resolution)
      return assembleWithMicAndPlayback(raw, msg.micEnabled, {
        cameraEnabled: msg.cameraEnabled,
        crop: msg.crop,
        viewportWidth: msg.viewportWidth,
        // tabCapture 会接管标签页声音（原页静音），必须回放给用户
        playback: true,
      })
    }
    case 'screen': {
      const raw = await getDesktopStream()
      return assembleWithMicAndPlayback(raw, msg.micEnabled, {
        cameraEnabled: msg.cameraEnabled,
        // 屏幕捕获不改变系统声音，回放会导致双重音频
        playback: false,
      })
    }
  }
}

async function assembleWithMicAndPlayback(
  raw: MediaStream,
  micEnabled: boolean,
  opts: { cameraEnabled?: boolean; crop?: CropRect; viewportWidth?: number; playback?: boolean },
): Promise<AssembledStream> {
  const stopPlayback = opts.playback === false ? noop : playAudioOutLoud(raw)
  const rawVideo = raw.getVideoTracks()[0]
  if (!rawVideo) throw new Error('捕获的流中没有视频轨')
  const tabAudio = raw.getAudioTracks()[0]
  const ownedStreams: MediaStream[] = [raw]

  // 仅在需要裁剪/人像叠加时走 canvas 合成（合成依赖 rAF，宿主页隐藏时会退化）；
  // 纯 screen 录制直接录原始轨，宿主窗口最小化也不受影响
  const useCompositor = !!opts.cameraEnabled || !!opts.crop
  let compositor: StreamCompositor | null = null
  let videoTrack: MediaStreamTrack = rawVideo
  if (useCompositor) {
    if (opts.crop && !opts.viewportWidth) throw new Error('区域录制缺少视口宽度')
    compositor = new StreamCompositor(rawVideo, opts.crop ?? null, opts.viewportWidth ?? 1)
    videoTrack = compositor.track
    if (opts.cameraEnabled) {
      try {
        ownedStreams.push(await compositor.enableCamera())
      } catch (e) {
        // 摄像头不可用（如 offscreen 内无法弹权限）时降级为无人像，不阻塞录制
        console.warn('[reclink] camera bubble unavailable:', e)
      }
    }
  }

  let micAudio: MediaStreamTrack | undefined
  const finish = (audioTracks: MediaStreamTrack[], mixed?: { cleanup: () => void }): AssembledStream => ({
    stream: new MediaStream([videoTrack, ...audioTracks]),
    ownedStreams,
    cleanup: () => {
      compositor?.destroy()
      mixed?.cleanup()
      stopPlayback()
    },
    compositor: compositor ?? undefined,
    micTrack: micAudio,
  })

  if (!micEnabled) {
    return finish(tabAudio ? [tabAudio] : [])
  }

  const mic = await getMicStream()
  ownedStreams.push(mic)
  micAudio = mic.getAudioTracks()[0]
  if (!tabAudio || !micAudio) {
    return finish([tabAudio ?? micAudio!].filter(Boolean))
  }

  const mixed = mixAudioStreams([new MediaStream([tabAudio]), mic])
  return finish([mixed.track], mixed)
}
