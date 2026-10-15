import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import ControlBar from './ControlBar'

const HOST_ID = 'reclink-control-bar'

// 模块体每个 isolated world 只执行一次（import 缓存），重复 executeScript 不会
// 重新挂载；但扩展重载后是全新 world，页面里遗留的旧 host 已是孤儿（旧监听器
// 随旧 context 失效、界面冻结），必须全部移除重建——重复 id 时 getElementById
// 只返回第一个，用 querySelectorAll 清扫干净
document.querySelectorAll(`#${HOST_ID}`).forEach((el) => el.remove())
const host = document.createElement('div')
host.id = HOST_ID
const shadow = host.attachShadow({ mode: 'open' })
const container = document.createElement('div')
shadow.appendChild(container)
document.body.appendChild(host)
const root = createRoot(container)
root.render(
  <StrictMode>
    <ControlBar />
  </StrictMode>,
)
