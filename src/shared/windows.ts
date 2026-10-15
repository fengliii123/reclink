/** 以独立 popup 小窗打开扩展内部页面（完成页/标注页/识别页共用） */
export async function openPopupWindow(path: string, width: number, height: number): Promise<chrome.windows.Window | null> {
  return (await chrome.windows.create({
    type: 'popup',
    url: chrome.runtime.getURL(path),
    width,
    height,
    focused: true,
  })) ?? null
}
