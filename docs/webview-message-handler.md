# `src/core/webview/webviewMessageHandler.ts` 详解

`webviewMessageHandler.ts` 是 VS Code 扩展里的通信中枢：webview 发来的任何 `postMessage` 都会在这里被解析、校验、路由到合适的后端逻辑，再把结果回传出去。对于“动态 Workflow 轨迹追踪”需求而言，这个文件承担了 **“回溯请求入口 + 结果反馈”** 的角色，是桥接 WorkflowPanel 和 `Task`/checkpoint 服务的关键。下面从结构、流程与注意事项几个角度进行说明。

## 1. 总体结构

- 文件导入了大量 schema（Zod）与 handler，其中 `workflowNodeRestorePayloadSchema` 专门用于校验 WorkflowPanel 发来的回溯请求。
- 主导函数 `createWebviewMessageHandler` 返回一个 async handler，内部是一个 `switch (message.type)` 的大分发器，每个 case 处理一种消息。
- Workflow 相关的 case 主要有两个：
  1. `workflowNodeRestore`
  2. `workflowNodeRestoreResult`（由扩展端主动 post 回去）

## 2. `workflowNodeRestore` 的详细流程

1. **接收消息**：当 webview 调用 `vscode.postMessage({ type: "workflowNodeRestore", payload })` 时，这里会匹配到对应 case。
2. **校验 payload**：使用 `workflowNodeRestorePayloadSchema.safeParse` 检查 `snapshotId`、`taskId`、`checkpointTs` 等字段是否合法，防止前端传入非法数据或缺少关键字段。
3. **调用扩展业务逻辑**：
   - 如果校验通过，就找到当前的 `ClineProvider`/`Task`，调用 `provider.requestWorkflowNodeRestore(payload)`，真正执行 checkpoint 恢复。
   - 这个过程涉及 shadow repo 的 Git 操作，由 `src/core/task/Task.ts` 与 `src/core/checkpoints` 完成。
4. **返回结果**：无论成功或失败，这里都会通过 `postMessageToWebview({ type: "workflowNodeRestoreResult", ... })` 发送结果：
   - 成功：`status: "success"`，附带 `snapshotId`、可选的 `branchId`，让 webview 创建新分支、更新 UI。
   - 失败：`status: "error"` + `error` 文本，UI 可据此提示“恢复失败”。如果 schema 校验失败，也会直接返回错误 result。

## 3. 为什么它对 Workflow 很关键？

- **分支起点**：我们定义“回溯成功 = 新分支起点”。这个成功信号就是 `workflowNodeRestoreResult: success`，由 `webviewMessageHandler` 负责生成并推送给 webview。没有它，前端就不知道什么时候应该创建新 branch。
- **错误兜底**：如果 checkpoint 恢复失败，必须及时告诉用户；否则 WorkflowPanel 会一直显示 loading。这个文件负责统一捕获异常并回传 `status: "error"`。
- **协议稳定性**：所有回溯请求都通过这里校验，确保 webview 和扩展之间的数据格式一致，避免直接调用内部 API 导致的意外。

## 4. 与其它模块的关系

- **前端**：`webview-ui/src/context/ExtensionStateContext.tsx` 会在点击“回溯”时调用 `requestWorkflowNodeRestore`，最终发消息到这里；等收到 `workflowNodeRestoreResult` 再决定是否创建新分支、展示错误提示。
- **扩展后端**：`webviewMessageHandler` 将 payload 传给 `ClineProvider`/`Task`，由它们执行实际的 checkpoint restore。恢复完成后，同一 handler 负责把结果转成 webview 消息。
- **Schema**：`workflowNodeRestorePayloadSchema` 和 `WebviewMessage`/`ExtensionMessage` 定义了消息格式，是我们的“本地 API 契约”。

## 5. 注意事项与扩展建议

- **保持 schema 同步**：如果未来给回溯多加字段（例如 branchId、额外元数据），必须同时更新 schema 和前端解析逻辑。
- **统一错误信息**：为了良好的用户体验，这里应该对常见错误（Git 不可用、snapshot 不存在等）提供明确的 error message。
- **更丰富的结果**：除了告知成功/失败，可以考虑在 result 里附带更多信息（比如回溯耗时、文件 diff 概要），供 WorkflowPanel 展示。

总之，`webviewMessageHandler.ts` 是 Workflow 系统中 **前端与扩展端互通的网关**：它让 webview 能够安全地请求回溯，也让扩展在完成操作后及时反馈。理解它的逻辑，就能掌握回溯→新分支这一链路的“桥梁”细节。
