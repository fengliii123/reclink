"""E2E test: region picker overlay flow (drag select + confirm).

The actual tab recording after confirm needs activeTab (manual-only),
but the picker UX (overlay, drag, size label, toolbar, cleanup) is covered here.

Usage: python3 scripts/e2e_region.py
"""
import hashlib
import time
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
DIST = ROOT / 'dist'
HOST = '#reclink-region-picker'


def compute_extension_id(dist_path: Path) -> str:
    digest = hashlib.sha256(str(dist_path).encode()).hexdigest()
    return ''.join(chr(ord('a') + int(c, 16)) for c in digest[:32])


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
            target = context.new_page()
            target.goto('https://example.com')

            probe = context.new_page()
            probe.goto(f'chrome-extension://{ext_id}/src/popup/index.html')
            probe.wait_for_load_state('networkidle')
            popup = context.new_page()
            popup.goto(f'chrome-extension://{ext_id}/src/popup/index.html')
            popup.wait_for_load_state('networkidle')
            target.bring_to_front()

            # 触发区域录制：popup 模式选中后开始（popup 发 START_REGION）
            popup.click('button.mode:has-text("区域录制")')
            popup.click('button.start')

            # 选区器出现在目标页
            target.wait_for_selector(f'{HOST} .overlay', timeout=10000)
            print('picker overlay appeared')

            # 拖拽选区
            target.mouse.move(120, 120)
            target.mouse.down()
            target.mouse.move(420, 320, steps=8)
            target.mouse.up()
            size = target.locator(f'{HOST} .size').text_content()
            print(f'selection size label: {size}')
            assert '×' in size

            # 工具条出现并确认
            target.wait_for_selector(f'{HOST} .toolbar', timeout=5000)
            target.locator(f'{HOST} .btn.primary').click()
            target.wait_for_selector(HOST, state='detached', timeout=5000)
            print('confirmed and picker removed')

            # 自动化环境无 activeTab，tab 录制启动失败属预期；
            # 校验 SW 已清理 region 配置且状态回到 idle
            time.sleep(1)
            state = probe.evaluate("chrome.runtime.sendMessage({type:'GET_STATE'})")
            assert state['status'] == 'idle', f'state: {state}'
            print('OK: region picker flow verified')
        finally:
            context.close()


if __name__ == '__main__':
    main()
