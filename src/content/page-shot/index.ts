/**
 * 整页截图的滚动控制器：由 SW 注入并驱动。
 * SW 在每步之间调 captureVisibleTab，这里负责滚到位、等渲染、回报该步
 * 需要的内容高度（CSS px），结束时恢复原滚动位置。
 */
let savedY = 0

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

function totalHeight(): number {
  return Math.max(
    document.documentElement.scrollHeight,
    document.body?.scrollHeight ?? 0,
  )
}

async function prescroll(): Promise<void> {
  // 快速滚一遍触发懒加载内容，再回到顶部正式捕获
  const vh = window.innerHeight
  const steps = Math.min(40, Math.ceil(totalHeight() / vh))
  for (let i = 1; i < steps; i++) {
    window.scrollTo(0, i * vh)
    await sleep(120)
  }
  window.scrollTo(0, 0)
  await sleep(150)
}

chrome.runtime.onMessage.addListener((msg: { type: string; index?: number }, _sender, sendResponse) => {
  if (msg?.type === 'PAGE_SHOT_BEGIN') {
    savedY = window.scrollY
    void prescroll().then(() => {
      sendResponse({ viewportH: window.innerHeight, totalH: totalHeight() })
    })
    return true
  }
  if (msg?.type === 'PAGE_SHOT_STEP') {
    const vh = window.innerHeight
    const want = (msg.index ?? 0) * vh
    window.scrollTo(0, want)
    // 等待滚动与重绘；懒加载图片大多在此完成。注意 scrollTo 会被
    // max-scroll 钳制（最后一步常见），必须回报实际位置供拼接绝对定位
    sleep(320).then(() => {
      const actualY = window.scrollY
      const remaining = totalHeight() - actualY
      sendResponse({ actualY, needed: Math.max(0, Math.min(vh, remaining)) })
    })
    return true
  }
  if (msg?.type === 'PAGE_SHOT_END') {
    window.scrollTo(0, savedY)
    sendResponse({ ok: true })
    return false
  }
  return false
})
