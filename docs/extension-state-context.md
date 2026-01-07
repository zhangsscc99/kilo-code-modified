# `webview-ui/src/context/ExtensionStateContext.tsx` 与 Workflow

## 1. 文件职责

`ExtensionStateContext.tsx` 是 webview 端的“状态仓库”，负责监听 VS Code 扩展推送的消息（`window.addEventListener("message", ...)`），维护全局状态并向 React 组件提供上下文。在 Workflow 需求中，它承担：

1. 缓存 `taskEvents`、`workflowBranches`、`workflowRestoreState`、`currentCheckpoint` 等数据。
2. 收到 `workflowNodeRestoreResult` 时更新分支元信息。
3. 暴露 `requestWorkflowNodeRestore` 给 UI 使用，触发回溯。

## 2. 与 Workflow 强相关的状态

- `taskEvents`: `ReceivedTaskEvent[]`，所有 Task 的事件流。我们之前把 `.slice(-500)` 移除，就是为了让历史 checkpoint 不会丢失。
- `workflowBranches`: `WorkflowBranchInfo[]`，记录每条分支的 id、label、父 snapshot、状态（active/archived）。
- `activeWorkflowBranchId`: 当前运行分支，影响后续新事件的 `branchId`。
- `workflowRestoreState`: `pendingSnapshotId`, `lastCompletedSnapshotId`, `lastError`，用于 UI 显示“回溯中…/失败/成功”。
- `snapshotBranchAssignmentRef`: `snapshotId → branchId` 映射，帮助在回溯成功时确定新分支的来源。

## 3. 核心函数说明

### 3.1 `registerCheckpointSnapshot`

- 监听 `taskEvent` 时调用。如果事件是 `Message` 且包含 `checkpointHash`，就更新 `taskSnapshotCounterRef`、`snapshotBranchAssignmentRef`，把 `snapshotId` 与当前 `branchId` 绑定。
- 还会更新 `workflowBranches` 中对应分支的 `latestSnapshotId`。

### 3.2 `createBranchFromSnapshot`

- 在 `workflowNodeRestoreResult: success` 后调用：
  - 以被回溯的 `snapshotId` 作为 `parentSnapshotId`，创建一个新的 `WorkflowBranchInfo`。
  - 把旧的 active branch 设为 `archived`，新分支 `status = "active"`，并更新 `activeWorkflowBranchId`。

### 3.3 `requestWorkflowNodeRestore`

- UI 调用该函数发起 `vscode.postMessage({ type: "workflowNodeRestore", payload })`。
- 会在 `workflowRestoreState` 中标记 `pendingSnapshotId`，等待扩展回传结果。

### 3.4 `handleMessage`

- 这是最核心的消息分发：
  - `taskEvent`: 将 `branchId` 附加到事件，推入 `taskEvents`。
  - `workflowNodeRestoreResult`: 更新 `workflowRestoreState`，并根据结果调用 `createBranchFromSnapshot` 或记录错误。
  - `currentCheckpointUpdated`: 更新 `currentCheckpoint`，让 UI 标记“当前 checkpoint”。
  - 其它消息（mcpServers、rulesData 等）在我们的需求里次要。

## 4. 面试/文档讲法

- 可以说：“我在这个 context 里维护了 Workflow 所需的所有状态，并实现了回溯→新分支的完整闭环：UI 通过 context 发起请求，扩展回调再由 context 更新分支和节点。”
- 举例说明 `taskEvents` 被截断导致节点消失的 bug 是如何在这里修复的（移除 `.slice(-500)`）。
- 强调 context 既是状态管理，也是和扩展通信的桥梁，体现你在前端架构层面的能力。
