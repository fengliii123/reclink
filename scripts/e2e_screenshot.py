"""E2E test: screenshot feature (visible / region / full page / screen / delayed / import).

对齐 AS 截图 Tab 交互：卡片与功能行点击即执行（无选中态+确认按钮）。
整个屏幕截图走 offscreen getDisplayMedia（auto-select flag 自动选源）。

Usage: python3 scripts/e2e_screenshot.py
"""
import hashlib
import shutil
import time
from pathlib import Path

from PIL import Image
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
DIST = ROOT / 'dist'
HOST = '#reclink-region-picker'
DOWNLOAD_DIR = Path('/tmp/reclink-e2e-shot-downloads')
PROFILE = '/tmp/reclink-e2e-profile-shot'


def compute_extension_id(dist_path: Path) -> str:
    digest = hashlib.sha256(str(dist_path).encode()).hexdigest()
    return ''.join(chr(ord('a') + int(c, 16)) for c in digest[:32])


def find_complete_windows(probe):
    return probe.evaluate(
        """chrome.windows.getAll({populate: true}).then((ws) => ws
          .map((w) => (w.tabs && w.tabs[0] && w.tabs[0].url) || '')
          .filter((u) => u.includes('src/complete/index.html')))"""
    )


def wait_text(page, selector, want, timeout=5):
    deadline = time.time() + timeout
    while time.time() < deadline:
        if page.locator(selector).text_content() == want:
            return
        time.sleep(0.15)
    raise AssertionError(f'{selector} text never became {want!r}')


def wait_new_complete(probe, known, timeout=15):
    deadline = time.time() + timeout
    while time.time() < deadline:
        fresh = [u for u in find_complete_windows(probe) if u not in known]
        if fresh:
            return fresh[0]
        time.sleep(0.2)
    return None


def find_windows_with(probe, frag):
    return probe.evaluate(
        """async (frag) => (await chrome.windows.getAll({populate: true}))
          .map((w) => (w.tabs && w.tabs[0] && w.tabs[0].url) || '')
          .filter((u) => u.includes(frag))""",
        frag,
    )


def main():
    shutil.rmtree(PROFILE, ignore_errors=True)
    DOWNLOAD_DIR.mkdir(exist_ok=True)
    # 导入用测试图片
    import_png = Path('/tmp/reclink-shot-import.png')
    Image.new('RGB', (100, 60), (220, 60, 60)).save(import_png)

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
            user_data_dir=PROFILE,
            headless=False,
            args=context_args,
            viewport={'width': 1280, 'height': 800},
        )
        try:
            ext_id = compute_extension_id(DIST)
            target = context.new_page()
            target.goto('https://example.com')

            probe = context.new_page()
            cdp = context.new_cdp_session(probe)
            cdp.send('Browser.setDownloadBehavior', {
                'behavior': 'allow',
                'downloadPath': str(DOWNLOAD_DIR),
                'eventsEnabled': True,
            })
            probe.goto(f'chrome-extension://{ext_id}/src/popup/index.html')
            probe.wait_for_load_state('networkidle')

            def activate_target():
                probe.evaluate(
                    """async () => {
                      const tabs = await chrome.tabs.query({url: 'https://example.com/*', currentWindow: true})
                      if (tabs.length) await chrome.tabs.update(tabs[0].id, {active: true})
                    }"""
                )

            def open_shot_popup():
                popup = context.new_page()
                popup.goto(f'chrome-extension://{ext_id}/src/popup/index.html')
                popup.wait_for_load_state('networkidle')
                popup.locator('.tab:has-text("截图")').click()
                return popup

            known: set[str] = set()

            # ── 1. 可视区域（卡片点击即执行）──
            popup = open_shot_popup()
            activate_target()
            popup.click('.shot-card:has-text("可视区域")')
            url1 = wait_new_complete(probe, known)
            assert url1, 'visible shot: complete window not opened'
            known.add(url1)

            complete = context.new_page()
            complete.goto(url1)
            complete.wait_for_selector('.player img', timeout=5000)
            w = complete.evaluate("document.querySelector('.player img').naturalWidth")
            assert w > 0, 'screenshot image not decoded'
            assert '截图完成' in complete.locator('.done-badge').text_content()
            assert 'PNG' in complete.locator('.chip.format').text_content()
            print(f'visible shot OK, naturalWidth={w}')

            # 下载
            complete.click('button:has-text("下载")')
            deadline = time.time() + 10
            item = None
            while time.time() < deadline:
                items = complete.evaluate(
                    "chrome.downloads.search({orderBy:['-startTime'], limit:1})"
                )
                if items and items[0]['state'] == 'complete':
                    item = items[0]
                    break
                time.sleep(0.2)
            assert item, 'download did not complete'
            assert item['filename'].endswith('.png') and item.get('mime') == 'image/png', item
            print(f"download OK: {item['filename']}")

            # ── 2. 选择区域（卡片 → 选区器 → 截图确认）──
            popup = open_shot_popup()
            activate_target()
            popup.click('.shot-card:has-text("选择区域")')
            target.wait_for_selector(f'{HOST} .overlay', timeout=10000)
            wait_text(target, f'{HOST} .btn.primary', '截图')
            target.mouse.move(120, 120)
            target.mouse.down()
            target.mouse.move(420, 320, steps=8)
            target.mouse.up()
            target.wait_for_selector(f'{HOST} .toolbar', timeout=5000)
            target.locator(f'{HOST} .btn.primary').click()
            target.wait_for_selector(HOST, state='detached', timeout=5000)
            url2 = wait_new_complete(probe, known)
            assert url2, 'region shot: complete window not opened'
            known.add(url2)

            complete2 = context.new_page()
            complete2.goto(url2)
            complete2.wait_for_selector('.player img', timeout=5000)
            dims = complete2.evaluate(
                "(() => { const i = document.querySelector('.player img'); return [i.naturalWidth, i.naturalHeight] })()"
            )
            # 裁剪按 captureWidth/innerWidth 比例换算。macOS 下捕获尺寸偶发受
            # 窗口/显示状态影响整体缩放（实测同系数 0.877），精确值不稳定，
            # 断言宽高比与尺寸区间即可
            inner_w = target.evaluate('window.innerWidth')
            expect = [round(300 * w / inner_w), round(200 * w / inner_w)]
            print(f'region shot cropped to {dims[0]}x{dims[1]} (nominal {expect[0]}x{expect[1]})')
            ratio = dims[0] / dims[1]
            assert 1.45 < ratio < 1.55, f'crop aspect broken: {dims}'
            assert 150 <= dims[0] <= 800, f'crop size out of range: {dims}'

            # ── 3. 整个页面（滚动拼接：注入 3000px 高）──
            target.evaluate("document.body.style.height = '3000px'")
            popup = open_shot_popup()
            activate_target()
            popup.click('.shot-card:has-text("整个页面")')
            url3 = wait_new_complete(probe, known, timeout=30)
            assert url3, 'fullpage shot: complete window not opened'
            known.add(url3)
            target.evaluate("document.body.style.height = ''")

            complete3 = context.new_page()
            complete3.goto(url3)
            complete3.wait_for_selector('.player img', timeout=5000)
            fh = complete3.evaluate("document.querySelector('.player img').naturalHeight")
            assert fh > 4500, f'fullpage stitched height too small: {fh}'
            print(f'fullpage shot stitched height={fh}')

            # ── 3b. 整个屏幕（offscreen getDisplayMedia 抓单帧，auto-select 选源）──
            popup = open_shot_popup()
            activate_target()
            popup.click('.shot-row:has-text("整个屏幕或应用窗口")')
            url_s = wait_new_complete(probe, known, timeout=15)
            assert url_s, 'screen shot: complete window not opened'
            known.add(url_s)
            complete_s = context.new_page()
            complete_s.goto(url_s)
            complete_s.wait_for_selector('.player img', timeout=5000)
            sw = complete_s.evaluate("document.querySelector('.player img').naturalWidth")
            assert sw > 500, f'screen shot width suspicious: {sw}'
            print(f'screen (entire display) shot OK, naturalWidth={sw}')

            # ── 4. 延迟截取可视区域（3 秒后完成窗出现）──
            popup = open_shot_popup()
            activate_target()
            t0 = time.time()
            popup.click('.shot-row:has-text("延迟截取可视区域")')
            url4 = wait_new_complete(probe, known, timeout=15)
            assert url4, 'delayed shot: complete window not opened'
            elapsed = time.time() - t0
            assert elapsed > 2.5, f'delayed shot fired too early: {elapsed:.1f}s'
            known.add(url4)
            print(f'delayed shot OK after {elapsed:.1f}s')

            # ── 5. 标注本地图片（剪贴板无图 → 文件选择 → 标注编辑器）──
            popup = open_shot_popup()
            # 点击该行会先弹 chrome.permissions.request(clipboardRead) 的浏览器原生
            # 权限框，自动化无法点击、Promise 永挂，文件选择分支到不了（需人工验证）。
            # 此处直接向隐藏 input[type=file] 塞文件，验证 onChange → 入库 → 标注链路。
            popup.set_input_files('input[type=file]', str(import_png))
            ann_urls = []
            deadline = time.time() + 10
            while time.time() < deadline:
                ann_urls = find_windows_with(probe, 'src/annotate')
                if ann_urls:
                    break
                time.sleep(0.2)
            assert ann_urls, 'import image: annotate window not opened'
            known.add(ann_urls[0])

            imp = context.new_page()
            imp.goto(ann_urls[0])
            imp.wait_for_selector('.editor', timeout=5000)
            iw = imp.evaluate("document.querySelector('.editor').width")
            assert iw == 100, f'imported image width: {iw}'
            imp.close()
            print('import local image into annotator OK')

            # ── 6. 标注编辑器：完成页「标注」→ 画矩形 → 另存新条目 ──
            complete.click('button:has-text("标注")')
            ann_urls = []
            deadline = time.time() + 10
            while time.time() < deadline:
                ann_urls = find_windows_with(probe, 'src/annotate')
                if ann_urls:
                    break
                time.sleep(0.2)
            assert ann_urls, 'annotate window not opened'
            ann = context.new_page()
            ann.goto(ann_urls[0])
            ann.wait_for_selector('.editor', timeout=5000)
            box = ann.locator('.editor').bounding_box()
            assert box, 'editor canvas not visible'
            ann.mouse.move(box['x'] + box['width'] * 0.3, box['y'] + box['height'] * 0.3)
            ann.mouse.down()
            ann.mouse.move(box['x'] + box['width'] * 0.6, box['y'] + box['height'] * 0.5, steps=5)
            ann.mouse.up()
            ann.click('.tool-btn[title="文字"]')
            ann.mouse.click(box['x'] + box['width'] * 0.4, box['y'] + box['height'] * 0.7)
            ann.keyboard.type('reclink e2e')
            ann.keyboard.press('Control+Enter')
            time.sleep(0.3)
            ann.click('button:has-text("保存到录制库")')
            # SHOT_SAVED → SW 开新完成页（annotate 自关）
            url6 = None
            deadline = time.time() + 15
            while time.time() < deadline:
                url6 = wait_new_complete(probe, known, timeout=1)
                if url6:
                    break
                time.sleep(0.3)
            assert url6, 'annotated save did not open complete window'
            known.add(url6)

            complete6 = context.new_page()
            complete6.goto(url6)
            complete6.wait_for_selector('.player img', timeout=5000)
            print('annotate flow OK (rect + text → new library entry)')

            # ── 7. 录制库 7 条截图 ──
            lib = context.new_page()
            lib.goto(f'chrome-extension://{ext_id}/src/library/index.html')
            lib.wait_for_load_state('networkidle')
            lib.wait_for_selector('.badge.screenshot')
            count = lib.locator('.badge.screenshot').count()
            assert count == 7, f'screenshot items: {count}'
            lib.locator('li.item >> nth=0 >> button:has-text("预览")').click()
            lib.wait_for_selector('img.preview.shot', timeout=5000)
            print('library lists 7 screenshots with image preview')
            print('OK: screenshot feature verified')
        finally:
            context.close()


if __name__ == '__main__':
    main()
