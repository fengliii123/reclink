"""生成 Chrome Web Store 商店截图（1280×800）到 store/screenshots/。

实拍流程：popup 两 Tab、开录倒计时/控制条、完成页、区域选区，均为真实功能流
（fake media stream）。popup 窗口小图合成到品牌渐变背景上，整页截图直接取
1280×800 视口。

Usage: python3 scripts/store_screenshots.py
"""
import hashlib
import json
import threading
import time
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
DIST = ROOT / 'dist'
OUT = ROOT / 'store' / 'screenshots'
OUT.mkdir(parents=True, exist_ok=True)

# 演示用本地页面（测试机无外网，且内容可控更像真实工作页）
PAGE_HTML = b'''<!doctype html><html><head><meta charset="utf-8"><style>\nbody { margin:0; font-family:-apple-system,'PingFang SC',sans-serif; background:#fff; color:#1f2937; }\n.hero { padding:48px 56px 24px; }\n.hero h1 { font-size:34px; margin:0 0 12px; }\n.hero p { font-size:16px; color:#6b7280; margin:0; max-width:640px; line-height:1.7; }\n.cards { display:grid; grid-template-columns:repeat(3,1fr); gap:16px; padding:16px 56px; }\n.card { border:1px solid #e5e7eb; border-radius:12px; padding:20px; }\n.card b { display:block; font-size:15px; margin-bottom:8px; }\n.card span { font-size:13px; color:#6b7280; line-height:1.6; }\n.bar { height:8px; border-radius:4px; background:linear-gradient(90deg,#4f8dff,#7458f7); width:64%; margin:24px 56px; }\n</style></head><body>\n<div class="hero"><h1>2026 Q4 \u4ea7\u54c1\u8def\u7ebf\u56fe</h1>\n<p>\u672c\u9875\u6c47\u603b\u4e86\u672c\u5b63\u5ea6\u7684\u4e09\u4e2a\u6838\u5fc3\u76ee\u6807\u4e0e\u5173\u952e\u7ed3\u679c\u3002\u5f55\u5236\u8fd9\u6bb5\u6f14\u793a\u89c6\u9891\uff0c\u5411\u56e2\u961f\u540c\u6b65\u6700\u65b0\u8fdb\u5c55\u3002</p></div>\n<div class="bar"></div>\n<div class="cards">\n<div class="card"><b>\u5f55\u5236\u4e0e\u5206\u4eab</b><span>\u6807\u7b7e\u9875\u3001\u6574\u5c4f\u3001\u533a\u57df\u4e0e\u6444\u50cf\u5934\u56db\u79cd\u6a21\u5f0f\uff0c\u5168\u7a0b\u672c\u5730\u5904\u7406\u3002</span></div>\n<div class="card"><b>\u622a\u56fe\u4e0e\u6807\u6ce8</b><span>\u53ef\u89c6\u533a\u57df\u3001\u6574\u9875\u62fc\u63a5\u3001\u533a\u57df\u622a\u56fe\uff0c\u5185\u7f6e\u6807\u6ce8\u7f16\u8f91\u5668\u3002</span></div>\n<div class="card"><b>\u6587\u672c\u8bc6\u522b</b><span>\u9009\u533a OCR\uff0c\u8bed\u8a00\u5305\u5185\u7f6e\uff0c\u79bb\u7ebf\u53ef\u7528\u3002</span></div>\n</div></body></html>'''


class _Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        self.send_response(200)
        self.send_header('Content-Type', 'text/html; charset=utf-8')
        self.send_header('Content-Length', str(len(PAGE_HTML)))
        self.end_headers()
        self.wfile.write(PAGE_HTML)

    def log_message(self, *a):
        pass


MANIFEST = DIST / 'manifest.json'
BACKUP = DIST / '.manifest.orig.json'


def patch_manifest():
    """自动化拿不到 activeTab，临时给 dist 注入 host_permissions（跑完恢复），
    与 scripts/e2e_all.py 同一做法。"""
    m = json.loads(MANIFEST.read_text())
    if '<all_urls>' in (m.get('host_permissions') or []):
        return
    json.dump(m, BACKUP.open('w'), ensure_ascii=False, indent=2)
    m['host_permissions'] = ['<all_urls>']
    MANIFEST.write_text(json.dumps(m, ensure_ascii=False, indent=2))


def restore_manifest():
    if BACKUP.exists():
        BACKUP.rename(MANIFEST)


def ext_id():
    digest = hashlib.sha256(str(DIST).encode()).hexdigest()
    return ''.join(chr(ord('a') + int(c, 16)) for c in digest[:32])


def get_state(page):
    return page.evaluate("chrome.runtime.sendMessage({type:'GET_STATE'})")


def wait_status(page, want, timeout=20):
    deadline = time.time() + timeout
    while time.time() < deadline:
        s = get_state(page)
        if s['status'] == want:
            return s
        time.sleep(0.2)
    raise AssertionError(f'timed out waiting for {want}')


def main():
    patch_manifest()
    srv = HTTPServer(('127.0.0.1', 0), _Handler)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    url = f'http://127.0.0.1:{srv.server_port}/'
    raw = Path('/tmp/reclink-store-raw')
    raw.mkdir(exist_ok=True)
    eid = ext_id()
    with sync_playwright() as p:
        ctx = p.chromium.launch_persistent_context(
            user_data_dir='/tmp/reclink-e2e-profile-store', headless=False,
            args=[f'--disable-extensions-except={DIST}', f'--load-extension={DIST}',
                  '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream',
                  '--lang=zh-CN'],
            viewport={'width': 1280, 'height': 800})
        target = ctx.new_page()
        target.goto(url)
        # ── 1/2 popup 两个 Tab（360 宽小窗）──
        popup = ctx.new_page()
        popup.goto(f'chrome-extension://{eid}/src/popup/index.html')
        popup.wait_for_timeout(900)
        probe = ctx.new_page()
        probe.goto(f'chrome-extension://{eid}/src/popup/index.html')
        popup.set_viewport_size({'width': 360, 'height': 520})
        popup.wait_for_timeout(300)
        popup.screenshot(path=str(raw / 'popup-record.png'))
        popup.locator('.tab:has-text("截图")').click()
        popup.wait_for_timeout(400)
        popup.screenshot(path=str(raw / 'popup-shot.png'))

        # ── 3 屏幕录制：倒计时 + 控制条 + 页面批注工具条 ──
        # SW 以点击时的活动标签页作为控制条宿主，先把演示页激活
        probe.evaluate(
            """async () => {
              const tabs = await chrome.tabs.query({url: 'http://127.0.0.1/*'})
              if (tabs.length) await chrome.tabs.update(tabs[0].id, {active: true})
            }"""
        )
        popup.locator('.tab:has-text("录屏")').click()
        popup.wait_for_timeout(200)
        popup.click('button.mode:has-text("桌面")')
        popup.click('button.start')
        # 倒计时遮罩（若有）
        try:
            target.wait_for_selector('.countdown-overlay', timeout=2500)
            target.wait_for_timeout(600)
            target.screenshot(path=str(raw / 'countdown.png'))
        except Exception:
            pass
        wait_status(probe, 'recording', timeout=25)
        target.wait_for_selector('.bar', timeout=10000)
        time.sleep(1.2)  # 计时器走一会儿
        target.screenshot(path=str(raw / 'control-bar.png'))

        # ── 4 区域选区（先停掉录制）──
        target.locator('.bar .stop-btn').click()
        wait_status(probe, 'idle', timeout=25)
        # 完成页小窗
        comp = None
        for w in ctx.pages:
            if 'src/complete' in w.url:
                comp = w
                break
        if comp:
            comp.wait_for_selector('.player video, .player img', timeout=15000)
            comp.wait_for_timeout(800)
            comp.screenshot(path=str(raw / 'complete.png'))

        popup = ctx.new_page()
        popup.goto(f'chrome-extension://{eid}/src/popup/index.html')
        popup.wait_for_timeout(600)
        popup.locator('.tab:has-text("截图")').click()
        popup.wait_for_timeout(300)
        target.bring_to_front()
        target.wait_for_timeout(300)
        # 区域截图入口（3 卡片中第三个）
        popup.click('.shot-card:has-text("选择区域")')
        try:
            target.wait_for_selector('#reclink-region-picker .overlay', timeout=5000)
            target.mouse.move(880, 260)
            target.mouse.down()
            target.mouse.move(1180, 480, steps=10)
            target.mouse.up()
            target.wait_for_selector('#reclink-region-picker .toolbar', timeout=5000)
            target.wait_for_timeout(400)
            target.screenshot(path=str(raw / 'region.png'))
        except Exception as e:
            print('region picker skipped:', e)
        ctx.close()

    # ── 合成 1280×800（popup 小图放品牌渐变背景中央）──
    from PIL import Image, ImageFilter
    for name in ['popup-record', 'popup-shot']:
        src = Image.open(raw / f'{name}.png').convert('RGB')
        bg = Image.new('RGB', (1280, 800))
        px = bg.load()
        for y in range(800):
            t = y / 800
            r = int(243 + (232 - 243) * t)
            g = int(246 + (238 - 246) * t)
            b = int(252 + (255 - 252) * t)
            for x in range(1280):
                px[x, y] = (r, g, b)
        # 软阴影 + 居中
        shadow = Image.new('RGBA', (src.width + 60, src.height + 60), (0, 0, 0, 0))
        blk = Image.new('RGBA', (src.width + 24, src.height + 24), (20, 30, 60, 70))
        shadow.paste(blk, (18, 18))
        shadow = shadow.filter(ImageFilter.GaussianBlur(18))
        off = ((1280 - src.width) // 2, (800 - src.height) // 2)
        bg.paste(shadow, (off[0] - 30, off[1] - 30), shadow)
        bg.paste(src, off)
        bg.save(OUT / f'{name}-1280.png')
        print('saved', OUT / f'{name}-1280.png')
    # 整页类截图本身就是 1280×800 视口
    for name in ['countdown', 'control-bar', 'complete', 'region']:
        f = raw / f'{name}.png'
        if f.exists():
            img = Image.open(f).convert('RGB')
            if img.size != (1280, 800):
                img = img.resize((1280, 800))
            img.save(OUT / f'{name}-1280.png')
            print('saved', OUT / f'{name}-1280.png')
    restore_manifest()
    print('done ->', OUT)


if __name__ == '__main__':
    main()
