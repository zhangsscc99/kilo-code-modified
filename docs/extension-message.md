# `src/shared/ExtensionMessage.ts` 详解

## 1. 文件定位

`ExtensionMessage.ts` 位于 `src/shared/`，是 VS Code 扩展与 webview 之间 **所有消息类型的集中定义处**。扩展端通过 `postMessageToWebview` 发送 `ExtensionMessage`；webview 在 `ExtensionStateContext`、`WorkflowPanel` 等组件里使用这些类型解析消息。换句话说，它是我们本地“RPC 协议”的数据契约。

## 2. 与 Workflow 需求直接相关的部分

1. **`WebviewTaskEvent` & `taskEvent` 消息**
   - 字段：`eventName: RooCodeEventName`、`payload: unknown[]`、`taskId?: number`、`taskIdentifier?: string`、`branchId?: string`、`taskEventTimestamp` 等。
   - 作用：扩展端（`Task.ts`/`ClineProvider.ts`）用它把 Task 的所有状态/行为（Message、TaskStarted、TaskCompleted、TaskDelegated…）发送给 webview。`buildWorkflowNodesFromTaskEvents` 正是基于这份结构解析并生成节点。
   - 要点：如果要新增事件或字段（例如给节点加更多 metadata），必须在这里同步更新类型，确保前后端一致。

2. **`workflowNodeRestoreResult` 消息**
   - 字段：`status: "success" | "error"`、`snapshotId`、`branchId?`、`error?`。
   - 作用：回溯成功/失败的反馈通道。Webview 收到 success 后会调用 `createBranchFromSnapshot` 创建新分支；失败则在节点详情中显示错误。
   - 要点：如果需要携带额外信息（比如回溯耗时、diff 概要），也要在此处扩展类型。

3. **`WorkflowBranchInfo` / `WorkflowRestoreStateSnapshot`**
   - `WorkflowBranchInfo` 字段包括 `id`、`label`、`parentSnapshotId`、`parentBranchId`、`createdAt`、`status`，是我们在 `ExtensionStateContext` 中维护 `workflowBranches` 的依据。
   - `WorkflowRestoreStateSnapshot` 记录回溯进行中的状态（`pendingSnapshotId`、`lastCompletedSnapshotId`、`lastError`），同样由这个文件定义，让 webview 能够展示“回溯中…”、“恢复失败”等 UI。

4. **`WebviewMessage` 中的 `workflowNodeRestore`**
   - 这是 webview 向扩展发起回溯请求的消息类型（payload 结构同 `workflowNodeRestorePayloadSchema`）。
   - 在面试中可强调：我们通过这套消息协议实现了回溯 -> 新分支逻辑，保证了扩展端和 UI 的强一致性。

## 4. 面试/讲解要点

- 可把它描述为“我们自定义的 Webview/Extension 协议层”，说明你在项目中不仅写 UI，还参与或熟悉前后端契约设计。
- 如果要修改 Workflow 相关的消息（新增字段、优化结构），这就是必须同步更新的文件；在 PR/面试里强调这一点，有助于展示你对系统耦合面的把控。
- 常见陷阱：若扩展端发送的字段与这里定义不符，webview 会出现解析错误或 `undefined` 数据。我们在 `webviewMessageHandler`、`ExtensionStateContext` 里都使用了这些类型进行校验/推断。

总之，`ExtensionMessage.ts` 是 Workflow 系统（乃至整个扩展）的“协议字典”，确保扩展端、webview、测试都共用同一套类型，是我们实现跨层消息流的基础。
