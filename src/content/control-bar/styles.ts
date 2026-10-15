export const controlBarStyles = `
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

:host {
  all: initial;
}

@keyframes bar-in {
  from { opacity: 0; transform: translate(-50%, 14px); }
  to { opacity: 1; transform: translate(-50%, 0); }
}

/* ── 实时批注画布：工具激活时接管指针 ── */
.anno-canvas {
  position: fixed;
  inset: 0;
  z-index: 2147483646;
  pointer-events: none;
  touch-action: none;
  user-select: none;
}

.anno-canvas.active {
  pointer-events: auto;
  cursor: crosshair;
}

.anno-canvas.eraser {
  cursor: cell;
}

/* ── 录制控制条：深炭灰圆角条，底部居中、上移避开 Chrome 原生共享指示条 ── */
.bar {
  position: fixed;
  bottom: 70px;
  left: 50%;
  transform: translate(-50%, 0);
  z-index: 2147483647;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 8px;
  background: rgba(46, 49, 52, 0.96);
  border-radius: 10px;
  box-shadow: 0 6px 24px rgba(0, 0, 0, 0.35), 0 1px 4px rgba(0, 0, 0, 0.2);
  font-family: -apple-system, 'PingFang SC', 'Microsoft YaHei', sans-serif;
  font-size: 12.5px;
  color: #fff;
  user-select: none;
  animation: bar-in 0.28s cubic-bezier(0.2, 0.8, 0.3, 1);
}

/* 折叠态：只留计时 + 停止 + 展开 */
.bar.compact {
  gap: 4px;
  padding: 5px 7px;
}

/* ── 顶部浮动工具条（批注工具 / 光标效果二态，AS 同款）── */
.strip {
  position: fixed;
  bottom: 112px;
  left: 50%;
  transform: translate(-50%, 0);
  z-index: 2147483647;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 8px;
  background: rgba(46, 49, 52, 0.96);
  border-radius: 10px;
  box-shadow: 0 6px 24px rgba(0, 0, 0, 0.35), 0 1px 4px rgba(0, 0, 0, 0.2);
  font-family: -apple-system, 'PingFang SC', 'Microsoft YaHei', sans-serif;
  animation: strip-in 0.22s cubic-bezier(0.2, 0.8, 0.3, 1);
}

@keyframes strip-in {
  from { opacity: 0; transform: translate(-50%, 10px); }
  to { opacity: 1; transform: translate(-50%, 0); }
}

.divider {
  width: 1px;
  height: 18px;
  background: #5a5d63;
  margin: 0 4px;
  flex-shrink: 0;
}

.label {
  font-size: 12.5px;
  color: rgba(255, 255, 255, 0.85);
  white-space: nowrap;
  padding: 0 6px;
}

.timer {
  font-variant-numeric: tabular-nums;
  font-weight: 700;
  font-size: 15px;
  color: #fff;
  min-width: 44px;
  text-align: center;
}

button {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  border: none;
  border-radius: 8px;
  width: 30px;
  height: 30px;
  padding: 0;
  font-family: inherit;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
  white-space: nowrap;
  transition: background 0.12s, filter 0.12s;
}

button:active {
  transform: scale(0.94);
}

.pause-btn {
  background: #3b82f6;
  color: #fff;
}

.pause-btn:hover {
  background: #2f74e4;
}

.pause-btn.paused {
  background: #4a7fe8;
}

.stop-btn {
  background: #e85d5d;
  color: #fff;
  width: auto;
  padding: 0 12px;
}

.stop-btn:hover {
  background: #de4d4d;
}

/* 工具/开关类按钮：摄像头、麦克风、光标效果、批注、折叠等 */
.tool-btn {
  background: transparent;
  color: rgba(255, 255, 255, 0.75);
}

.tool-btn:hover {
  background: rgba(255, 255, 255, 0.14);
  color: #fff;
}

.tool-btn.lit {
  background: rgba(59, 130, 246, 0.3);
  color: #9ec1f8;
}

.tool-btn.muted {
  color: rgba(255, 255, 255, 0.4);
}

.color-dots {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 0 2px;
}

.color-dot {
  width: 16px;
  height: 16px;
  border-radius: 50%;
  border: 2px solid rgba(255, 255, 255, 0.25);
}

.color-dot:hover {
  border-color: rgba(255, 255, 255, 0.6);
}

.color-dot.sel {
  border-color: #fff;
  box-shadow: 0 0 0 2px rgba(255, 255, 255, 0.25);
}
`
