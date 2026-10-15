"""E2E test: OCR (截图提取文本).

popup 截图 Tab「截图提取文本」→ region-picker 选区（确认按钮=识别）→
SW 截取裁剪入库 → 打开 ocr 页 → tesseract（全部本地资源）识别 →
文本含页面标题。整条链路离线可跑。

Usage: python3 scripts/e2e_ocr.py
"""
import hashlib
import shutil
import time
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
DIST = ROOT / 'dist'
HOST = '#reclink-region-picker'
PROFILE = '/tmp/reclink-e2e-profile-ocr'


def compute_extension_id(dist_path: Path) -> str:
    digest = hashlib.sha256(str(dist_path).encode()).hexdigest()
    return ''.join(chr(ord('a') + int(c, 16)) for c in digest[:32])


def wait_text(page, selector, want, timeout=5):
    deadline = time.time() + timeout
    while time.time() < deadline:
        if page.locator(selector).text_content() == want:
            return
        time.sleep(0.15)
    raise AssertionError(f'{selector} text never became {want!r}')


def main():
    shutil.rmtree(PROFILE, ignore_errors=True)
    with sync_playwright() as p:
        context = p.chromium.launch_persistent_context(
            user_data_dir=PROFILE,
            headless=False,
            args=[
                f'--disable-extensions-except={DIST}',
                f'--load-extension={DIST}',
                '--use-fake-ui-for-media-stream',
                '--use-fake-device-for-media-stream',
                '--lang=zh-CN',
            ],
            viewport={'width': 1280, 'height': 800},
        )
        try:
            ext_id = compute_extension_id(DIST)
            target = context.new_page()
            target.goto('https://example.com')

            probe = context.new_page()
            probe.goto(f'chrome-extension://{ext_id}/src/popup/index.html')
            probe.wait_for_load_state('networkidle')

            def activate_target():
                probe.evaluate(
                    """async () => {
                      const tabs = await chrome.tabs.query({url: 'https://example.com/*', currentWindow: true})
                      if (tabs.length) await chrome.tabs.update(tabs[0].id, {active: true})
                    }"""
                )

            popup = context.new_page()
            popup.goto(f'chrome-extension://{ext_id}/src/popup/index.html')
            popup.wait_for_load_state('networkidle')
            popup.locator('.tab:has-text("截图")').click()
            activate_target()
            popup.click('.shot-row:has-text("截图提取文本")')

            target.wait_for_selector(f'{HOST} .overlay', timeout=10000)
            wait_text(target, f'{HOST} .btn.primary', '识别')
            # 框住标题区域（Example Domain 在页面左上）
            target.mouse.move(30, 60)
            target.mouse.down()
            target.mouse.move(700, 220, steps=8)
            target.mouse.up()
            target.wait_for_selector(f'{HOST} .toolbar', timeout=5000)
            target.locator(f'{HOST} .btn.primary').click()
            target.wait_for_selector(HOST, state='detached', timeout=5000)

            deadline = time.time() + 15
            ocr_url = None
            while time.time() < deadline:
                ocr_url = probe.evaluate(
                    """chrome.windows.getAll({populate: true}).then((ws) => {
                      for (const w of ws) {
                        const u = (w.tabs && w.tabs[0] && w.tabs[0].url) || ''
                        if (u.includes('src/ocr')) return u
                      }
                      return null
                    })"""
                )
                if ocr_url:
                    break
                time.sleep(0.2)
            assert ocr_url, 'ocr window not opened'
            print(f'ocr window: {ocr_url}')

            ocr = context.new_page()
            ocr.goto(ocr_url)
            # wasm 引擎冷加载 + 识别（全本地），给足时间
            ocr.wait_for_selector('.result textarea', timeout=120000)
            deadline = time.time() + 10
            text = ''
            while time.time() < deadline:
                text = ocr.locator('.result textarea').input_value()
                if text.strip():
                    break
                time.sleep(0.5)
            print(f'ocr text: {text[:120]!r}')
            assert 'xample' in text or 'omain' in text, 'expected page title text in OCR result'
            print('OK: OCR verified (local tesseract, region → text)')
        finally:
            context.close()


if __name__ == '__main__':
    main()
