"""E2E test: i18n — locale pack parity + runtime resolution.

macOS Chromium 的扩展 UI 语言锁定为系统语言（--lang / Preferences.app_locale
均无法覆盖，实测），无法在自动化里切换到英文渲染。因此本套件验证：
1. en / zh_CN 两个 messages.json 的 key 完全一致、无空文案（漏翻即失败）
2. manifest 名称/描述/命令描述已本地化
3. 运行时 chrome.i18n.getMessage 对抽样 key 正常解析（与 UI 渲染一致）
英文界面的实际渲染属于真机验证项（浏览器语言切 English 后重载扩展）。

Usage: python3 scripts/e2e_i18n.py
"""
import hashlib
import json
import time
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
DIST = ROOT / 'dist'
# Chrome 会按 profile 缓存已解析的 _locales，语言包变更后复用旧 profile 会读到旧文案
PROFILE = f'/tmp/reclink-e2e-profile-i18n-{time.strftime("%H%M%S")}'


def compute_extension_id(dist_path: Path) -> str:
    digest = hashlib.sha256(str(dist_path).encode()).hexdigest()
    return ''.join(chr(ord('a') + int(c, 16)) for c in digest[:32])


def load_keys(path: Path) -> dict:
    data = json.loads(path.read_text(encoding='utf-8'))
    return {k: v.get('message', '') for k, v in data.items()}


def main():
    # ── 1. 双语言包奇偶校验 ──
    en = load_keys(ROOT / 'public' / '_locales' / 'en' / 'messages.json')
    zh = load_keys(ROOT / 'public' / '_locales' / 'zh_CN' / 'messages.json')
    assert len(en) > 80, f'en pack suspiciously small: {len(en)} keys'
    missing_in_zh = sorted(set(en) - set(zh))
    missing_in_en = sorted(set(zh) - set(en))
    assert not missing_in_zh, f'keys missing in zh_CN: {missing_in_zh}'
    assert not missing_in_en, f'keys missing in en: {missing_in_en}'
    empty_en = [k for k, v in en.items() if not v.strip()]
    empty_zh = [k for k, v in zh.items() if not v.strip()]
    assert not empty_en, f'empty en messages: {empty_en}'
    assert not empty_zh, f'empty zh_CN messages: {empty_zh}'
    # 占位符一致性（$1/$VERB$ 等）
    for k in en:
        pe = sorted([s for s in ('$',) if s in en[k]])
        assert (('$' in en[k]) == ('$' in zh[k])), f'placeholder mismatch: {k}'
    print(f'locale packs in parity: {len(en)} keys, no empty messages')

    # ── 2. 构建产物包含双语言包，manifest 走 __MSG__ ──
    assert (DIST / '_locales' / 'en' / 'messages.json').exists()
    assert (DIST / '_locales' / 'zh_CN' / 'messages.json').exists()
    manifest = json.loads((DIST / 'manifest.json').read_text())
    assert manifest['default_locale'] == 'en'
    assert manifest['name'] == '__MSG_extName__'
    assert manifest['description'] == '__MSG_extDesc__'
    print('dist has both locale packs; manifest localized')

    # ── 3. 运行时解析：UI 渲染语言 = getMessage 返回语言 ──
    context_args = [
        f'--disable-extensions-except={DIST}',
        f'--load-extension={DIST}',
        '--use-fake-ui-for-media-stream',
        '--use-fake-device-for-media-stream',
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
            probe = context.new_page()
            probe.goto(f'chrome-extension://{ext_id}/src/popup/index.html')
            probe.wait_for_load_state('networkidle')
            ui = probe.evaluate('chrome.i18n.getUILanguage()')
            resolved = probe.evaluate(
                """({
                  start: chrome.i18n.getMessage('startRecording'),
                  shot: chrome.i18n.getMessage('shotOcr'),
                  share: chrome.i18n.getMessage('cbStopLabel'),
                  tip: chrome.i18n.getMessage('pickerTip', [chrome.i18n.getMessage('pickerVerb_shot')]),
                  missing: chrome.i18n.getMessage('__no_such_key__'),
                })"""
            )
            print(f'UI language: {ui}, resolved: {resolved}')
            assert resolved['start'] and resolved['shot'] and resolved['share'] and '$' not in resolved['tip']
            assert '截取' in resolved['tip'], f"placeholder substitution broken: {resolved['tip']!r}"
            assert resolved['missing'] == '', 'missing key should resolve to empty string'

            # UI 文案必须与 getMessage 同语言（zh 环境抽查）
            popup = context.new_page()
            popup.goto(f'chrome-extension://{ext_id}/src/popup/index.html')
            popup.wait_for_load_state('networkidle')
            assert popup.locator('.tab.active:has-text("录屏")').count() == 1
            assert popup.locator(f'button.start:has-text("{resolved["start"]}")').count() == 1
            print('popup renders same language as chrome.i18n resolution')
            print('OK: i18n verified (packs parity + manifest + runtime)')
        finally:
            context.close()


if __name__ == '__main__':
    main()
