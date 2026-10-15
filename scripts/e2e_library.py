"""E2E test: recording library (OPFS + IndexedDB persistence).

Flow: record camera x2 → library lists 2 → preview works → delete one →
restart browser with same profile → library persists with remaining item.

Usage: python3 scripts/e2e_library.py
"""
import hashlib
import shutil
import time
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
DIST = ROOT / 'dist'


def compute_extension_id(dist_path: Path) -> str:
    digest = hashlib.sha256(str(dist_path).encode()).hexdigest()
    return ''.join(chr(ord('a') + int(c, 16)) for c in digest[:32])


def wait_status(page, want, timeout=20):
    deadline = time.time() + timeout
    state = None
    while time.time() < deadline:
        state = page.evaluate("chrome.runtime.sendMessage({type:'GET_STATE'})")
        if state['status'] == want:
            return state
        time.sleep(0.2)
    raise AssertionError(f'timed out waiting for status {want}, got {state}')


def record_one(popup, probe):
    # camera 走真实流程（offscreen + 倒计时）；popup 派发后自关，用 probe 轮询
    popup.click('button.mode:has-text("摄像头")')
    popup.click('button.start')
    wait_status(probe, 'recording')
    time.sleep(1.5)
    probe.evaluate("chrome.runtime.sendMessage({type:'CONTROL_STOP'})")
    wait_status(probe, 'idle')


# 每次运行独立 profile（Chrome 会按 profile 缓存 unpacked 扩展的 SW 脚本，
# 复用旧 profile 会跑到旧代码）；本套件内部两次 launch 共用同一目录以验证持久化
PROFILE = f'/tmp/reclink-e2e-profile-lib-{time.strftime("%H%M%S")}'


def launch(p, args):
    return p.chromium.launch_persistent_context(
        user_data_dir=PROFILE,
        headless=False,
        args=args,
    )


def main():
    # 录制库断言基于精确条数，先清掉 profile 里的历史数据
    shutil.rmtree(PROFILE, ignore_errors=True)
    ext_id = compute_extension_id(DIST)
    context_args = [
        f'--disable-extensions-except={DIST}',
        f'--load-extension={DIST}',
        '--use-fake-ui-for-media-stream',
        '--use-fake-device-for-media-stream',
        '--lang=zh-CN',
    ]
    with sync_playwright() as p:
        # ---- session 1: record x2, verify library, delete one ----
        context = launch(p, context_args)
        try:
            probe = context.new_page()
            probe.goto(f'chrome-extension://{ext_id}/src/popup/index.html')
            probe.wait_for_load_state('networkidle')
            popup = context.pages[0] if context.pages else context.new_page()
            popup.goto(f'chrome-extension://{ext_id}/src/popup/index.html')
            popup.wait_for_load_state('networkidle')

            record_one(popup, probe)
            # popup 可能已自关，第二条需要新开
            popup2 = context.new_page()
            popup2.goto(f'chrome-extension://{ext_id}/src/popup/index.html')
            popup2.wait_for_load_state('networkidle')
            record_one(popup2, probe)

            lib = context.new_page()
            lib.goto(f'chrome-extension://{ext_id}/src/library/index.html')
            lib.wait_for_load_state('networkidle')
            lib.wait_for_selector('.item', timeout=10000)
            count = lib.locator('.item').count()
            print(f'library items: {count}')
            assert count == 2, f'expected 2 items, got {count}'
            assert '已用' in lib.locator('.usage').text_content()

            # preview: video element with a blob src appears
            lib.locator('.item').first.locator('button:has-text("预览")').click()
            lib.wait_for_selector('video.preview', timeout=10000)
            src = lib.locator('video.preview').get_attribute('src')
            assert src and src.startswith('blob:'), f'preview src: {src}'
            print('preview ok')

            # delete first item（扩展页 CSP 禁止 eval，用 locator 轮询代替 wait_for_function）
            lib.locator('.item').first.locator('button:has-text("删除")').click()
            deadline = time.time() + 10
            while time.time() < deadline:
                if lib.locator('.item').count() == 1:
                    break
                time.sleep(0.2)
            assert lib.locator('.item').count() == 1, 'delete did not remove item'
            print('deleted one')
        finally:
            context.close()

        # ---- session 2: same profile, library persists ----
        context = launch(p, context_args)
        try:
            lib = context.new_page()
            lib.goto(f'chrome-extension://{ext_id}/src/library/index.html')
            lib.wait_for_load_state('networkidle')
            lib.wait_for_selector('.item', timeout=10000)
            count = lib.locator('.item').count()
            print(f'after restart, library items: {count}')
            assert count == 1, f'expected 1 item after restart, got {count}'
            badge = lib.locator('.badge').first.text_content()
            assert badge == '摄像头', f'badge: {badge}'
            print('OK: library persisted across browser restart')
        finally:
            context.close()


if __name__ == '__main__':
    main()
