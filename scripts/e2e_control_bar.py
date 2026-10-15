"""E2E test: control bar injection and interaction.

Camera recording started via the real flow (popup → recorder-window,
auto-starts with fake device). Camera mode has no target tab, so the
control bar is injected manually into example.com and state changes are
relayed to the tab (mimicking SW's tabs.sendMessage for tab/screen modes).
Verifies: injection, timer, pause/resume via bar, stop via bar, unmount
on idle.

Usage: python3 scripts/e2e_control_bar.py
"""
import hashlib
import time
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
DIST = ROOT / 'dist'
DOWNLOAD_DIR = Path('/tmp/reclink-e2e-downloads')

HOST_SEL = '#reclink-control-bar'


def compute_extension_id(dist_path: Path) -> str:
    digest = hashlib.sha256(str(dist_path).encode()).hexdigest()
    return ''.join(chr(ord('a') + int(c, 16)) for c in digest[:32])


def get_state(page):
    return page.evaluate("chrome.runtime.sendMessage({type:'GET_STATE'})")


def wait_status(page, want, timeout=15):
    deadline = time.time() + timeout
    state = None
    while time.time() < deadline:
        state = get_state(page)
        if state['status'] == want:
            return state
        time.sleep(0.2)
    raise AssertionError(f'timed out waiting for status {want}, got {state}')


def relay_state(probe):
    """把 SW 的真实录制状态转发给 example.com 标签页上的控制条
    （camera 模式无 targetTabId，SW 不会 tabs.sendMessage 到该页）"""
    probe.evaluate(
        """async () => {
          const s = await chrome.runtime.sendMessage({type: 'GET_STATE'})
          const tabs = await chrome.tabs.query({url: 'https://example.com/*'})
          await chrome.tabs.sendMessage(tabs[0].id, {type: 'STATE_CHANGED', state: s})
        }"""
    )


def main():
    context_args = [
        f'--disable-extensions-except={DIST}',
        f'--load-extension={DIST}',
        '--use-fake-ui-for-media-stream',
        '--use-fake-device-for-media-stream',
        '--lang=zh-CN',
    ]
    with sync_playwright() as p:
        context = p.chromium.launch_persistent_context(
            user_data_dir=f'/tmp/reclink-e2e-profile-{time.strftime("%H%M%S")}',
            headless=False,
            args=context_args,
        )
        try:
            ext_id = compute_extension_id(DIST)
            print(f'extension id: {ext_id}')

            target = context.new_page()
            target.on('console', lambda m: print(f'[target {m.type}] {m.text}'))
            target.on('pageerror', lambda e: print(f'[target pageerror] {e}'))
            target.goto('https://example.com')

            # 新交互下 popup 派发后自关；探测/查询用常驻页
            probe = context.new_page()
            probe.goto(f'chrome-extension://{ext_id}/src/popup/index.html')
            probe.wait_for_load_state('networkidle')
            cdp = context.new_cdp_session(probe)

            popup = context.new_page()
            popup.goto(f'chrome-extension://{ext_id}/src/popup/index.html')
            popup.wait_for_load_state('networkidle')
            cdp.send('Browser.setDownloadBehavior', {
                'behavior': 'allow',
                'downloadPath': str(DOWNLOAD_DIR),
                'eventsEnabled': True,
            })

            # 真实流程启动 camera 录制（popup → recorder-window 自动开录）
            popup.click('button.mode:has-text("摄像头")')
            popup.click('button.start')
            wait_status(probe, 'recording')

            # 手动注入一次，把 executeScript 的错误暴露到测试输出
            manual = probe.evaluate("""async () => {
              const js = chrome.runtime.getManifest().content_scripts?.[0]?.js?.[0]
              const tabs = await chrome.tabs.query({url: 'https://example.com/*'})
              // 读 loader 源码，提取动态 import 的真实 chunk
              const loaderSrc = await (await fetch(chrome.runtime.getURL(js))).text()
              const m = loaderSrc.match(/getURL\\("([^"]+)"\\)/)
              const chunk = m ? m[1] : null
              let importResult = null
              if (chunk) {
                const results = await chrome.scripting.executeScript({
                  target: {tabId: tabs[0].id},
                  func: async (u) => {
                    const before = !!document.getElementById('reclink-control-bar')
                    try {
                      await import(chrome.runtime.getURL(u))
                    } catch (e) {
                      return {before, imported: false, error: String(e)}
                    }
                    await new Promise(r => setTimeout(r, 300))
                    const host = document.getElementById('reclink-control-bar')
                    return {
                      before,
                      imported: true,
                      after: !!host,
                      afterHtml: host?.shadowRoot?.innerHTML?.slice(0, 200) ?? null,
                      bodyChildIds: [...document.body.children].map(c => c.id).filter(Boolean).slice(0, 5),
                    }
                  },
                  args: [chunk],
                })
                importResult = results[0].result
              }
              return {js, chunk, importResult}
            }""")
            print(f'manual inject: {manual}')

            # bar injected and visible on target page (open shadow DOM, css pierces)
            try:
                bar = target.locator(f'{HOST_SEL} .bar')
                bar.wait_for(state='visible', timeout=10000)
            except Exception:
                host_info = target.evaluate("""() => {
                  const h = document.getElementById('reclink-control-bar')
                  if (!h) return {host: false}
                  return {
                    host: true,
                    shadow: !!h.shadowRoot,
                    html: h.shadowRoot ? h.shadowRoot.innerHTML.slice(0, 300) : null,
                  }
                }""")
                print(f'host info: {host_info}')
                raise
            timer_text = target.locator(f'{HOST_SEL} .timer').text_content()
            print(f'bar visible, timer: {timer_text}')
            assert ':' in timer_text

            # pause via bar（CONTROL_* 走真实 SW → recorder-window 链路）
            target.locator(f'{HOST_SEL} .pause-btn').click()
            wait_status(probe, 'paused')
            relay_state(probe)
            # STATE_CHANGED 广播 + React 渲染是异步的，probe 先行看到 paused，此处轮询等文案跟上
            label = ''
            for _ in range(50):
                label = target.locator(f'{HOST_SEL} .pause-btn').get_attribute('title')
                if label == '继续':
                    break
                time.sleep(0.2)
            assert label == '继续', f'pause label: {label}'
            print('paused via bar')

            # resume via bar
            target.locator(f'{HOST_SEL} .pause-btn').click()
            wait_status(probe, 'recording')
            relay_state(probe)
            print('resumed via bar')

            time.sleep(1)

            # stop via bar; bar 常驻设计：idle 后隐藏（不 detach）
            target.locator(f'{HOST_SEL} .stop-btn').click()
            wait_status(probe, 'idle', timeout=20)
            relay_state(probe)
            target.wait_for_selector(f'{HOST_SEL} .bar', state='hidden', timeout=10000)
            print('bar hidden after idle')

            deadline = time.time() + 10
            complete = None
            while time.time() < deadline:
                for pg in context.pages:
                    if 'complete/index.html' in pg.url:
                        complete = pg
                        break
                if complete:
                    break
                time.sleep(0.2)
            assert complete, 'complete page did not open'
            complete.wait_for_selector('video', timeout=10000)
            print('OK: control bar flow with complete page')
        finally:
            context.close()


if __name__ == '__main__':
    main()
