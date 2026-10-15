/**
 * macOS 上 chrome.windows.create({type:'popup', width, height}) 的尺寸会在
 * 创建后的不确定时机（原生选源器开合引起焦点变化等）被异步覆盖为父窗口大小，
 * 且可能在数秒之后才触发。页面侧常驻检查自身窗口尺寸并拉回目标值
 * （与 Vidline 页面内 windows.update 自救同款方案）。
 * maxDurationMs 可限制保护期（避免和用户手动调整无限打架），默认常驻。
 */
export function setupWindowSizeGuard(width: number, height: number, maxDurationMs?: number): () => void {
  let active = true

  const enforce = async () => {
    if (!active) return
    try {
      const win = await chrome.windows.getCurrent()
      if (win.id == null || win.width == null || win.height == null) return
      // 最小化窗口跳过（update 尺寸会把窗口意外恢复）
      if (win.state === 'minimized') return
      // 已基本达标（±8px 容差）则不动，减少无谓的 update 调用
      if (Math.abs(win.width - width) <= 8 && Math.abs(win.height - height) <= 8) return
      await chrome.windows.update(win.id, { width, height })
    } catch {
      // 窗口可能正在关闭，忽略
    }
  }

  const timer = setInterval(() => void enforce(), 1000)
  const maxTimer = maxDurationMs != null ? setTimeout(stop, maxDurationMs) : null
  window.addEventListener('focus', () => void enforce())
  document.addEventListener('visibilitychange', () => void enforce())
  void enforce()

  function stop(): void {
    if (!active) return
    active = false
    clearInterval(timer)
    if (maxTimer != null) clearTimeout(maxTimer)
  }
  return stop
}
