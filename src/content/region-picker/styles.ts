export const pickerStyles = `
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

:host {
  all: initial;
}

.overlay {
  position: fixed;
  inset: 0;
  z-index: 2147483647;
  background: rgba(10, 22, 44, 0.45);
  cursor: crosshair;
  font-family: -apple-system, 'PingFang SC', 'Microsoft YaHei', sans-serif;
  animation: fade-in 0.18s ease-out;
}

@keyframes fade-in {
  from { opacity: 0; }
  to { opacity: 1; }
}

.crosshair-tip {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  background: rgba(22, 35, 58, 0.85);
  color: #fff;
  font-size: 13px;
  padding: 10px 18px;
  border-radius: 999px;
  pointer-events: none;
  white-space: nowrap;
}

.rect {
  position: absolute;
  border: 2px solid #0669ff;
  border-radius: 6px;
  background: rgba(6, 105, 255, 0.08);
  box-shadow: 0 0 0 100000px rgba(10, 22, 44, 0.45);
  pointer-events: none;
}

.size {
  position: absolute;
  top: -30px;
  left: 0;
  background: #0669ff;
  color: #fff;
  font-size: 12px;
  font-weight: 600;
  padding: 3px 10px;
  border-radius: 6px;
  white-space: nowrap;
}

.toolbar {
  position: absolute;
  display: flex;
  gap: 8px;
  background: #fff;
  padding: 8px;
  border-radius: 14px;
  box-shadow: 0 8px 28px rgba(6, 30, 80, 0.3);
  animation: pop-in 0.18s cubic-bezier(0.2, 0.8, 0.3, 1);
  z-index: 1;
}

@keyframes pop-in {
  from { opacity: 0; transform: translateY(8px) scale(0.96); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}

.btn {
  border: none;
  border-radius: 10px;
  padding: 8px 16px;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
}

.btn.primary {
  background: linear-gradient(135deg, #0669ff, #0659ff);
  color: #fff;
  box-shadow: 0 3px 10px rgba(6, 105, 255, 0.35);
}

.btn.reset {
  background: #e0eefe;
  color: #0669ff;
}

.btn.ghost {
  background: none;
  color: #5b6b83;
}
`
