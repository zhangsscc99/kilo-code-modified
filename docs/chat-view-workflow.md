# `webview-ui/src/components/chat/ChatView.tsx` 中与 Workflow 相关的逻辑

`ChatView.tsx` 是 Webview 内的主聊天视图，负责渲染消息、输入框、右侧面板等。虽然它的范围很大，但与 Workflow 需求相关的部分主要有：

## 1. WorkflowPanel 嵌入与布局

- ChatView 在右侧（或底部）嵌入 `WorkflowPanel`，并把来自 `ExtensionStateContext` 的数据（`taskEvents`、`workflowBranches`、`activeWorkflowBranchId`、`workflowRestoreState` 等）传递给它。
- 还负责处理面板折叠/展开、关闭等交互，并与聊天区布局（Virtuoso 尾部）协调。

## 2. Workflow 数据来源

- ChatView 通过 `useExtensionStateContext()` 获取 `taskEvents`、`workflowBranches` 等状态，这些状态在 context 中维护（详见 `ExtensionStateContext.tsx`）。
- 当 `WorkflowPanel` 发起回溯（调用 `onRestoreNode`）后，ChatView 会把该请求传回 context 的 `requestWorkflowNodeRestore`。

## 3. 当前 checkpoint 提示

- ChatView 会监听 `currentCheckpoint`（来自 context），并向 `WorkflowPanel` 传入 `currentCheckpoint` prop，这样节点在 UI 中可以高亮“当前 checkpoint”。

## 4. 面板交互与状态同步

- 用户在 ChatView 中点击 WorkflowPanel 的折叠按钮时，ChatView 会更新自身状态，决定是否渲染缩略面板（collapsed view）。这保证 WorkflowPanel 无论展开/折叠都能正常渲染。
- ChatView 在挂载时会把 `WorkflowPanel` 放在 Virtuoso 的 footer（可滚动区域下方），确保聊天滚动时 WorkflowPanel 保持可见。

## 5. 面试讲法建议

- 说明你如何在主 ChatView 中集成 WorkflowPanel：处理布局、折叠、数据流；强调这不是独立页面，需要与聊天消息滚动、窗口大小等行为协同。
- 可以提到 ChatView 在 `useActionHandlers` 或 `useExtensionStateContext` 中如何监听 `workflowNodeRestoreResult`，再把状态下传给 WorkflowPanel，让 UI 表现与后端状态一致。

总之，`ChatView.tsx` 是 WorkflowPanel 的宿主，它确保 Workflow 数据和聊天界面同步，提供入口让用户在聊天过程中直接查看/操作 Workflow DAG，是整体体验的一部分。
