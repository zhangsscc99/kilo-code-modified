# `webview-ui/src/components/chat/ChatEventTrace.tsx` 与 Workflow 的关系

`ChatEventTrace.tsx` 负责渲染聊天事件时间线（Agent Events 视图中的右侧部分）。它把 `TaskEvent` 中的 Hook、工具调用、系统提示等转成可视化节点。虽然 WorkflowPanel 是另一个组件，但它们共享同一份事件数据，因此在需求中互为补充：WorkflowPanel 管理 checkpoint DAG，而 ChatEventTrace 提供更细粒度的事件日志。

## 1. 数据来源

- 来自 `buildChatEventTrace(messages)`（通常在 ChatView / WorkflowPanel 一起使用），包括 `type`（tool/hook/agent）、`title`、`timestamp`、`sourceMessage` 等字段。
- 这些数据与 `taskEvents` 同步更新，确保每次消息/工具调用都能在事件时间线里看到。

## 2. 与 Workflow 的互补

- Workflow 节点中展开的 `node.events` 与 ChatEventTrace 的数据非常相似：
  - Workflow 节点展示的是“某个 checkpoint 之前累积的事件”。
  - ChatEventTrace 则以全局时间线的方式展示所有事件，不局限于某个节点。
- 当用户在 WorkflowPanel 中查看节点时，可在 ChatEventTrace 中进一步定位该时刻的工具调用细节，便于排查问题。

## 3. UI 特点

- 采用类似“垂直时间线”的样式，左侧有彩色圆点 + 虚线，右侧是事件标题与时间戳。展开后可查看 `sourceMessage` 原始 JSON。
- 支持循环渲染来自不同类型的事件（tool、hook、system message），让 WorkflowPanel 的事件详情更易理解。

## 4. 面试讲法建议

- 可以说：“WorkflowPanel 是 checkpoint DAG，而 ChatEventTrace 是更细粒度的事件日志，两者靠同一份 `taskEvent` 数据，不仅能回溯分支，还能实时审计代理行为。”
- 强调在这个组件中，我们把 `taskEvent` 转换成用户友好的 UI，从而提升可观测性与可解释性。

总之，`ChatEventTrace.tsx` 是 Workflow 系统的“事件窗口”，帮助我们在分支图之外还原代理的每一步操作。 
