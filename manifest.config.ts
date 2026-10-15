import { defineManifest } from '@crxjs/vite-plugin'

export default defineManifest({
  manifest_version: 3,
  name: '__MSG_extName__',
  description: '__MSG_extDesc__',
  default_locale: 'en',
  version: '0.3.0',
  icons: {
    '16': 'icons/16.png',
    '32': 'icons/32.png',
    '48': 'icons/48.png',
    '128': 'icons/128.png',
  },
  action: {
    default_title: 'reclink',
    default_popup: 'src/popup/index.html',
    default_icon: {
      '16': 'icons/16.png',
      '32': 'icons/32.png',
      '48': 'icons/48.png',
      '128': 'icons/128.png',
    },
  },
  background: {
    service_worker: 'src/background/index.ts',
    type: 'module',
  },
  permissions: [
    'offscreen',
    'tabCapture',
    'downloads',
    'storage',
    'scripting',
    'tabs',
    'activeTab',
    'clipboardWrite',
    'notifications',
  ],
  // 仅 popup"导入图片"读取剪贴板时按需申请（chrome.permissions.request）
  optional_permissions: ['clipboardRead'],
  // 注入控制条/选区/整页截图均发生在用户点击扩展的活动标签页上，
  // activeTab 即可覆盖，无需常驻 host 权限（审核友好）。
  // offscreen 录屏走 tabCapture / getDisplayMedia，与 host 权限无关。
  optional_host_permissions: ['<all_urls>'],
  // OCR 的 tesseract wasm 需要放宽 CSP（MV3 唯一允许的 eval 类放宽项）
  content_security_policy: {
    extension_pages: "script-src 'self' 'wasm-unsafe-eval'; object-src 'self'",
  },
  // 控制条不静态注入（matches 永不命中），仅在录制开始后由 SW 通过
  // chrome.scripting.executeScript 动态注入到目标标签页；在此声明是为让
  // crxjs 将其构建为无 hash 的稳定文件供 executeScript 引用
  content_scripts: [
    {
      matches: ['https://invalid.reclink.local/*'],
      js: ['src/content/control-bar/index.tsx'],
      run_at: 'document_idle',
    },
    {
      matches: ['https://invalid.reclink.local/*'],
      js: ['src/content/region-picker/index.ts'],
      run_at: 'document_idle',
    },
    {
      matches: ['https://invalid.reclink.local/*'],
      js: ['src/content/page-shot/index.ts'],
      run_at: 'document_idle',
    },
  ],
  // 控制条 bundle 由 crxjs 输出为带 hash 的文件，其 loader 通过动态 import
  // 加载真实模块，需要对所有页面开放 assets（否则注入后 import 失败）
  web_accessible_resources: [
    {
      resources: ['assets/*'],
      matches: ['<all_urls>'],
    },
  ],
  commands: {
    _execute_action: {
      suggested_key: { default: 'Ctrl+Shift+9' },
      description: '__MSG_cmdOpen__',
    },
    capture_visible: {
      suggested_key: { default: 'Ctrl+Shift+S' },
      description: '__MSG_cmdCapture__',
    },
  },
})
