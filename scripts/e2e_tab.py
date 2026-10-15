"""E2E test: tab-mode guardrails.

tabCapture 的 activeTab 授权只能来自真实的工具栏图标点击（浏览器原生 UI，
自动化无法合成），因此 tab 模式黄金路径需人工验证。本脚本验证可自动化的部分：
1. chrome:// 等内部页面：不再报错，自动切换整屏流程（offscreen getDisplayMedia，
   auto-select flag 下真实开录，全程无扩展窗口）
2. 未调用扩展时 SW 正确返回 activeTab 错误（而非崩溃/挂起）
3. 权限受限时 popup 出现"授权并开始"引导，且授权后状态能推进

Usage: python3 scripts/e2e_tab.py
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
            print(f'extension id: {ext_id}')

            target = context.new_page()
            target.goto('https://example.com')

            # 新交互下 popup 派发成功后 window.close() 自关，探测/查询用常驻页
            probe = context.new_page()
            probe.goto(f'chrome-extension://{ext_id}/src/popup/index.html')
            probe.wait_for_load_state('networkidle')

            popup = context.new_page()
            popup.goto(f'chrome-extension://{ext_id}/src/popup/index.html')
            popup.wait_for_load_state('networkidle')

            # bring_to_front 受系统焦点影响不稳定，用扩展 API 确定性激活标签页
            def activate_self(page):
                page.evaluate(
                    "chrome.tabs.getCurrent().then((t) => chrome.tabs.update(t.id, {active: true}))"
                )

            def activate_url(pat):
                probe.evaluate(
                    """async (pat) => {
                      const tabs = await chrome.tabs.query({url: pat, currentWindow: true})
                      if (tabs.length) await chrome.tabs.update(tabs[0].id, {active: true})
                    }""",
                    pat,
                )

            # 1. 内部页面：popup 自身为活动页（chrome-extension://），tab 模式应
            #    自动切换整屏流程（offscreen getDisplayMedia），不出现报错
            activate_self(popup)
            popup.click('button.mode:has-text("当前标签页")')
            popup.click('button.start')

            # 注意：Playwright 的 context.pages 经常不列出 type:popup 窗口，
            # 必须经扩展 API (windows.getAll) 检查
            def find_recorder_window():
                return probe.evaluate(
                    """chrome.windows.getAll({populate: true}).then((ws) => {
                      for (const w of ws) {
                        const url = (w.tabs && w.tabs[0] && w.tabs[0].url) || ''
                        if (url.includes('recorder-window')) return {url, state: w.state}
                      }
                      return null
                    })"""
                )

            # 内部页回退 = 整屏流程：auto-select 下 gDM 立即取流 → 倒计时 → 开录，
            # 全程无扩展窗口
            deadline = time.time() + 20
            state = None
            while time.time() < deadline:
                state = get_state(probe)
                if state and state['status'] == 'recording':
                    break
                time.sleep(0.2)
            assert state and state['status'] == 'recording', f'fallback should start screen recording: {state}'
            assert state['mode'] == 'screen', f'fallback mode mismatch: {state}'
            win = find_recorder_window()
            assert not win, f'internal-page fallback should not open any window, got: {win}'
            probe.evaluate("chrome.runtime.sendMessage({type:'CONTROL_STOP'})")
            deadline = time.time() + 15
            while time.time() < deadline:
                if get_state(probe)['status'] == 'idle':
                    break
                time.sleep(0.2)
            assert get_state(probe)['status'] == 'idle', 'state should return to idle after stop'
            print('internal-page auto-fallback OK (offscreen screen recording, no window)')

            # 2. 未调用扩展（无 activeTab）时的错误路径 + 授权引导（用新 popup 页，
            #    上一个已按新交互自关）
            popup = context.new_page()
            popup.goto(f'chrome-extension://{ext_id}/src/popup/index.html')
            popup.wait_for_load_state('networkidle')
            popup.click('button.mode:has-text("当前标签页")')
            activate_url('https://example.com/*')
            popup.click('button.start')
            popup.wait_for_selector('button.auth-btn', timeout=10000)
            print('authorize fallback appeared')
            popup.click('button.auth-btn')
            time.sleep(1)
            granted = popup.evaluate(
                "chrome.permissions.contains({origins: ['https://example.com/*']})"
            )
            assert granted, 'origin permission was not granted'
            state = get_state(popup)
            print(f'state after grant flow: {state["status"]}')
            # 自动化环境无法授予 activeTab，预期仍非 recording（错误被优雅处理）
            assert state['status'] == 'idle'
            # 清理：若 offscreen 因失败路径被创建，应已被关闭
            contexts = popup.evaluate("chrome.runtime.getContexts({})")
            offscreen = [c for c in contexts if c['contextType'] == 'OFFSCREEN_DOCUMENT']
            assert not offscreen, 'offscreen document leaked after failed start'
            print('OK: tab-mode guardrails verified')
        finally:
            context.close()


if __name__ == '__main__':
    main()
