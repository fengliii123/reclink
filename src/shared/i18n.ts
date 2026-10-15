/**
 * 轻量 i18n：Chrome 原生 _locales（en / zh_CN），语言跟随浏览器 UI 语言。
 * 扩展页与 content script 均可调用；key 缺失时回退为 key 本身便于发现漏翻。
 */
export function t(key: string, substitutions?: string | string[]): string {
  const subs = substitutions == null ? undefined : Array.isArray(substitutions) ? substitutions : [substitutions]
  return chrome.i18n.getMessage(key, subs) || key
}
