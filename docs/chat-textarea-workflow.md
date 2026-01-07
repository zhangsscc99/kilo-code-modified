# `webview-ui/src/components/chat/ChatTextArea.tsx` 与 Workflow 的关联

`ChatTextArea.tsx` 主要负责聊天输入框、发送按钮、快捷键（Enter/Shift+Enter 等）等交互。虽然它的核心功能是“发送消息”，但与 Workflow 需求也有几个关键连接点。

## 1. 触发 checkpoint/Workflow 更新的入口

- 用户在 ChatTextArea 里输入消息并发送后，扩展端会把本次消息转换成 `taskEvent`（`Message` 等），最终进入 WorkflowPanel。
- 如果发送消息时触发了 checkpoint（多数情况下 `Task.handleWebviewAskResponse` 会保存 checkpoint），WorkflowPanel 就会在下一次渲染时出现新的节点。因此可以将 ChatTextArea 视为 Workflow 构建链路的起点。

## 2. 状态与上下文传递

- ChatTextArea 通过 `useExtensionStateContext` 获取一些状态（如 `activeWorkflowBranchId`），在某些 case 下会显示当前模式/分支的提示。这确保用户知道“自己正在哪条分支上输入消息”。
- 在回溯后，`activeWorkflowBranchId` 会切换到新分支，此处的输入框也会自动对接新的上下文。

## 3. 与 WorkflowPanel 的 UI 协调

- ChatTextArea 与 WorkflowPanel 同在 ChatView 中，ChatTextArea 的 send 操作直接影响 WorkflowPanel 数据；同时，它也要与 WorkflowPanel 的折叠状态保持布局一致（比如 panel 展开时给输入区域留足空间）。

## 4. 面试讲法建议

- 在介绍 Workflow 系统时，可以补充：“我们的输入框与 Workflow 是紧密联动的：每次消息发送都会生成新的 TaskEvent、可能触发 checkpoint，WorkflowPanel 立即更新节点。”
- 说明当用户回溯到旧 checkpoint 后，这里会基于新的 active 分支继续发送消息，体现对多分支上下文的支持。

虽然 ChatTextArea 的改动相对较少，但它是触发 Workflow 更新的第一站，保证了回溯/分支逻辑与用户输入保持一致。 
