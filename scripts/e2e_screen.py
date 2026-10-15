"""E2E test: screen mode golden path — offscreen getDisplayMedia, zero window.

新架构：点开始录制（桌面）→ popup 自关 → offscreen 文档 getDisplayMedia 弹
Chrome 原生选源器（e2e 用 --auto-select-desktop-capture-source 自动选择
"Entire screen"）→ 目标页控制条 3-2-1 倒计时 → 开录 → 控制条停止 → 完成页。
全程不出现任何 recorder-window 扩展窗口。

Usage: python3 scripts/e2e_screen.py
"""
import hashlib
import time
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
DIST = ROOT / 'dist'


def compute_extension_id(dist_path: Path) -> str:
    digest = hashlib.sha256(str(dist_path).encode()).hexdigest()
    return ''.join(chr(ord('a') + int(c, 16)) for c in digest[:32])


def get_state(page):
    return page.evaluate("chrome.runtime.sendMessage({type:'GET_STATE'})")


def main():
    context_args = [
        f'--disable-extensions-except={DIST}',
        f'--load-extension={DIST}',
        '--use-fake-ui-for-media-stream',
        '--use-fake-device-for-media-stream',
        # getDisplayMedia 可被该 flag 自动接受（chooseDesktopMedia 不行）——
        # 整屏黄金路径因此首次可自动化
        '--auto-select-desktop-capture-source=Entire screen',
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
            target = context.new_page()
            target.goto('https://example.com')

            probe = context.new_page()
            probe.goto(f'chrome-extension://{ext_id}/src/popup/index.html')
            probe.wait_for_load_state('networkidle')

            def find_extension_window(fragment):
                return probe.evaluate(
                    """async (frag) => {
                      const ws = await chrome.windows.getAll({populate: true})
                      for (const w of ws) {
                        const url = (w.tabs && w.tabs[0] && w.tabs[0].url) || ''
                        if (url.includes(frag)) return url
                      }
                      return null
                    }""",
                    fragment,
                )

            popup = context.new_page()
            popup.goto(f'chrome-extension://{ext_id}/src/popup/index.html')
            popup.wait_for_load_state('networkidle')
            popup.click('button.mode:has-text("桌面")')
            # popup 以标签页模拟：派发前把活动标签页切回目标页（锚点）
            probe.evaluate(
                """async () => {
                  const tabs = await chrome.tabs.query({url: 'https://example.com/*', currentWindow: true})
                  if (tabs.length) await chrome.tabs.update(tabs[0].id, {active: true})
                }"""
            )
            popup.click('button.start')

            # 倒计时遮罩出现在目标页（控制条），而非任何扩展窗口
            target.wait_for_selector('.countdown-overlay', timeout=15000)
            print('countdown overlay visible on target page')

            deadline = time.time() + 15
            state = None
            while time.time() < deadline:
                state = get_state(probe)
                if state['status'] == 'recording':
                    break
                time.sleep(0.2)
            assert state and state['status'] == 'recording', f'not recording: {state}'
            assert state['mode'] == 'screen', f'mode mismatch: {state}'
            win = find_extension_window('recorder-window')
            assert not win, f'no recorder window should ever exist, got: {win}'
            # AS 式工具栏回归（可折叠 + 实时批注），分享条保持移除
            target.wait_for_selector('.bar', timeout=5000)
            assert not target.query_selector('.share-bar'), 'share bar should be removed'
            print('recording via offscreen getDisplayMedia, toolbar present, no window')

            # 实时批注：底部"批注"按钮弹出顶部工具条 → 画笔 → 画两条 → 撤销 → 清除
            target.click('button[title="批注"]')
            target.wait_for_selector('.strip', timeout=5000)
            target.click('.strip button[title="画笔"]')
            target.wait_for_selector('.anno-canvas.active', timeout=5000)
            target.mouse.move(300, 300)
            target.mouse.down()
            target.mouse.move(500, 380, steps=6)
            target.mouse.up()
            target.mouse.move(320, 420)
            target.mouse.down()
            target.mouse.move(520, 460, steps=4)
            target.mouse.up()
            assert int(target.get_attribute('.anno-canvas', 'data-ops') or '0') == 2, 'annotation ops != 2'
            # 橡皮：点选第二条笔迹中点，只删那一条
            target.click('.strip button[title="橡皮"]')
            target.mouse.move(420, 440)
            target.mouse.down()
            target.mouse.up()
            deadline = time.time() + 3
            while time.time() < deadline:
                if target.get_attribute('.anno-canvas', 'data-ops') == '1':
                    break
                time.sleep(0.1)
            assert target.get_attribute('.anno-canvas', 'data-ops') == '1', 'eraser should remove exactly one op'
            target.click('.strip button[title="清除批注"]')
            deadline = time.time() + 3
            while time.time() < deadline:
                if target.get_attribute('.anno-canvas', 'data-ops') == '0':
                    break
                time.sleep(0.1)
            assert target.get_attribute('.anno-canvas', 'data-ops') == '0', 'clear annotations failed'
            # 再点橡皮 = 切回普通光标（画布释放指针）
            target.click('.strip button[title="橡皮"]')
            assert not target.query_selector('.anno-canvas.active'), 'canvas should release pointer on tool toggle'
            print('live annotation: strip + pen draw + eraser + clear OK')

            # 光标效果：聚光灯生效并可回普通
            target.click('button[title="光标效果"]')
            target.wait_for_selector('.strip button[title="聚光灯"]', timeout=5000)
            target.click('.strip button[title="聚光灯"]')
            deadline = time.time() + 3
            while time.time() < deadline:
                if target.get_attribute('.anno-canvas', 'data-fx') == 'spotlight':
                    break
                time.sleep(0.1)
            assert target.get_attribute('.anno-canvas', 'data-fx') == 'spotlight', 'spotlight fx not active'
            target.mouse.move(600, 400)
            target.click('.strip button[title="普通光标"]')
            deadline = time.time() + 3
            while time.time() < deadline:
                if target.get_attribute('.anno-canvas', 'data-fx') == 'none':
                    break
                time.sleep(0.1)
            assert target.get_attribute('.anno-canvas', 'data-fx') == 'none', 'fx not reset to none'
            target.click('button[title="光标效果"]')
            assert not target.query_selector('.strip'), 'fx strip should toggle off'
            print('cursor effects: spotlight on/off OK')

            # 折叠 / 展开
            target.click('button[title="收起工具栏"]')
            target.wait_for_selector('.bar.compact', timeout=3000)
            target.click('.bar.compact button[title="展开工具栏"]')
            target.wait_for_selector('.bar:not(.compact)', timeout=3000)
            print('toolbar collapse/expand OK')

            time.sleep(1)
            target.click('.stop-btn')

            deadline = time.time() + 15
            complete = None
            while time.time() < deadline:
                complete = find_extension_window('src/complete/')
                if complete:
                    break
                time.sleep(0.2)
            assert complete, 'complete window did not open'
            state = get_state(probe)
            assert state['status'] == 'idle', f'state should be idle after stop: {state}'
            print(f'OK: screen golden path end-to-end (complete={complete})')

            # ── 第二阶段：孤儿节点回归 —— 倒计时/控制条必须复活 ──
            # （真实踩坑：扩展重载后旧页面上遗留的 #reclink-countdown / host 节点
            #  成为孤儿，守卫误判"已存在"导致新 world 不注册监听器 → 消息无接收端。
            #  runtime.reload 在 Playwright 下会禁用扩展，改用等效 DOM 条件模拟：
            #  新标签页 + 预先注入同名孤儿节点。）
            target2 = context.new_page()
            target2.goto('https://example.com')
            probe.evaluate(
                """async () => {
                  const tabs = await chrome.tabs.query({url: 'https://example.com/*', currentWindow: true})
                  const tab = tabs.find((t) => t.id !== tabs[0].id) ?? tabs[0]
                  await chrome.tabs.update(tab.id, {active: true})
                  await chrome.scripting.executeScript({
                    target: {tabId: tab.id},
                    func: () => {
                      for (const id of ['reclink-countdown', 'reclink-control-bar']) {
                        if (!document.getElementById(id)) {
                          const d = document.createElement('div')
                          d.id = id
                          // 孤儿控制条宿主内还有冻结的分享条 UI（扩展重载后遗留）
                          if (id === 'reclink-control-bar') {
                            d.innerHTML = '<div class="share-bar">stale</div>'
                          }
                          document.documentElement.appendChild(d)
                        }
                      }
                    },
                  })
                }"""
            )
            popup = context.new_page()
            popup.goto(f'chrome-extension://{ext_id}/src/popup/index.html')
            popup.wait_for_load_state('networkidle')
            popup.click('button.mode:has-text("桌面")')
            probe.evaluate(
                """async () => {
                  const tabs = await chrome.tabs.query({url: 'https://example.com/*', currentWindow: true})
                  const tab = tabs[tabs.length - 1]
                  if (tab) await chrome.tabs.update(tab.id, {active: true})
                }"""
            )
            popup.click('button.start')
            target2.wait_for_selector('.countdown-overlay', timeout=15000)
            deadline = time.time() + 15
            state = None
            while time.time() < deadline:
                state = get_state(probe)
                if state['status'] == 'recording':
                    break
                time.sleep(0.2)
            assert state and state['status'] == 'recording', f'not recording (orphan phase): {state}'
            # 冻结的旧分享条必须被清扫；screen 模式页面本就不该有任何分享条
            deadline = time.time() + 5
            while time.time() < deadline:
                if target2.locator('.share-bar').count() == 0:
                    break
                time.sleep(0.2)
            assert target2.locator('.share-bar').count() == 0, 'stale share bar not swept'
            print('with orphan nodes pre-planted: countdown revived, stale share bar swept')
            probe.evaluate("chrome.runtime.sendMessage({type:'CONTROL_STOP'})")
            deadline = time.time() + 15
            while time.time() < deadline:
                if get_state(probe)['status'] == 'idle':
                    break
                time.sleep(0.2)
            assert get_state(probe)['status'] == 'idle', 'idle after stop (orphan phase)'
            print('OK: orphan-node regression (extension reload scenario)')
        finally:
            context.close()


if __name__ == '__main__':
    main()
