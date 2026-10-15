"""E2E test: camera recording → complete page (preview + manual download).

Covers: start, pause/resume, SW restart recovery, MP4 direct recording,
complete page opening after stop, manual download from the complete page.

Usage: python3 scripts/e2e_camera.py
"""
import hashlib
import re
import shutil
import time
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
DIST = ROOT / 'dist'
DOWNLOAD_DIR = Path('/tmp/reclink-e2e-downloads')


def compute_extension_id(dist_path: Path) -> str:
    digest = hashlib.sha256(str(dist_path).encode()).hexdigest()
    return ''.join(chr(ord('a') + int(c, 16)) for c in digest[:32])


def get_state(page):
    return page.evaluate("chrome.runtime.sendMessage({type:'GET_STATE'})")


def wait_status(page, want, timeout=20):
    deadline = time.time() + timeout
    state = None
    while time.time() < deadline:
        state = get_state(page)
        if state['status'] == want:
            return state
        time.sleep(0.2)
    raise AssertionError(f'timed out waiting for status {want}, got {state}')


def wait_page(context, url_part, timeout=15):
    deadline = time.time() + timeout
    while time.time() < deadline:
        for page in context.pages:
            if url_part in page.url:
                return page
        time.sleep(0.2)
    raise AssertionError(f'page containing {url_part!r} did not open')


def main():
    if DOWNLOAD_DIR.exists():
        shutil.rmtree(DOWNLOAD_DIR)
    DOWNLOAD_DIR.mkdir(parents=True)

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

            page = context.pages[0] if context.pages else context.new_page()
            # 新交互下 popup 派发后自关，状态查询用常驻探测页
            probe = context.new_page()
            cdp = context.new_cdp_session(probe)
            cdp.send('Browser.setDownloadBehavior', {
                'behavior': 'allow',
                'downloadPath': str(DOWNLOAD_DIR),
                'eventsEnabled': True,
            })
            probe.goto(f'chrome-extension://{ext_id}/src/popup/index.html')
            probe.wait_for_load_state('networkidle')
            page.goto(f'chrome-extension://{ext_id}/src/popup/index.html')
            page.wait_for_load_state('networkidle')

            # 1. start camera recording (default format mp4, 3s countdown before record)
            page.click('button.mode:has-text("摄像头")')
            page.click('button.start')
            state = wait_status(probe, 'recording')
            print(f'started: {state}')
            badge = probe.evaluate("chrome.action.getBadgeText({})")
            # 商用版行为：录制中徽章显示实时计时 m:ss（红底），不再是 REC
            assert re.match(r'^\d+:\d{2}$', badge), f'badge: {badge}'

            probe.wait_for_timeout(2000)

            # 2. pause 2s then resume
            probe.evaluate("chrome.runtime.sendMessage({type:'CONTROL_PAUSE'})")
            wait_status(probe, 'paused')
            probe.wait_for_timeout(2000)
            probe.evaluate("chrome.runtime.sendMessage({type:'CONTROL_RESUME'})")
            wait_status(probe, 'recording')
            probe.wait_for_timeout(1000)

            # 3. kill the service worker; recording must survive
            targets = cdp.send('Target.getTargets')['targetInfos']
            sw_target = next(
                t for t in targets if t['type'] == 'service_worker' and ext_id in t['url']
            )
            cdp.send('Target.closeTarget', {'targetId': sw_target['targetId']})
            probe.wait_for_timeout(1000)
            state = wait_status(probe, 'recording')
            print(f'recovered after SW restart: pausedAccumMs={state["pausedAccumMs"]}')
            assert state['pausedAccumMs'] > 1500

            # 4. stop → complete page opens
            # 注意：Playwright 的 Chromium 无 H.264，MP4 会按设计回退 WebM；
            # 正式版 Chrome 支持 H.264，录出 MP4。按环境实际能力断言。
            mp4_supported = probe.evaluate("MediaRecorder.isTypeSupported('video/mp4')")
            expect_fmt = 'MP4' if mp4_supported else 'WEBM'
            probe.evaluate("chrome.runtime.sendMessage({type:'CONTROL_STOP'})")
            wait_status(probe, 'idle', timeout=20)
            complete = wait_page(context, 'complete/index.html')
            complete.wait_for_selector('video', timeout=10000)
            fmt_chip = complete.locator('.chip.format').text_content()
            print(f'complete page opened, format chip: {fmt_chip} (mp4 supported: {mp4_supported})')
            assert fmt_chip == expect_fmt, f'format chip: {fmt_chip}, expected {expect_fmt}'

            # 视频可解码（readyState >= 2）
            ready = complete.evaluate("document.querySelector('video').readyState")
            assert ready >= 2, f'video not loaded, readyState={ready}'

            # 5. 手动下载（CDP allow 模式下 saveAs 对话框被跳过）
            complete.locator('button.primary').click()
            deadline = time.time() + 15
            item = None
            while time.time() < deadline:
                items = complete.evaluate(
                    "chrome.downloads.search({orderBy:['-startTime'], limit:1})"
                )
                if items and items[0]['state'] == 'complete':
                    item = items[0]
                    break
                time.sleep(0.3)
            assert item, 'download did not complete'
            print(f"download: {item['filename']} mime={item.get('mime')}")
            assert item.get('mime') == ('video/mp4' if mp4_supported else 'video/webm')
            data = Path(item['filename']).read_bytes()
            assert len(data) > 10_000
            print(f'OK: {expect_fmt.lower()} recording, complete page, manual download, {len(data)} bytes')
        finally:
            context.close()


if __name__ == '__main__':
    main()
