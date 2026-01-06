# `src/shared/WebviewMessage.ts` 与 Workflow 回溯

## 1. 文件定位

`WebviewMessage.ts` 定义了 webview → 扩展的消息契约，并提供对应的 Zod schema。我们在 Workflow 需求中主要依赖 `workflowNodeRestore` 这一条路径：

1. webview（WorkflowPanel）发送 `workflowNodeRestore` 消息，请求扩展回溯到某个 checkpoint。
2. 扩展端（在 `webviewMessageHandler.ts` 里）用 `workflowNodeRestorePayloadSchema` 校验 payload，调用 `Task.restoreFromCheckpoint`。
3. 扩展执行完毕后，返回 `{ type: "workflowNodeRestoreResult", workflowNodeRestoreResult: ... }`，其 schema 定义在本文件中。

## 2. 关键类型说明

### 2.1 `WebviewMessage` 联合类型

- 其中的 `workflowNodeRestore` 分支长这样：
  ```ts
  { type: "workflowNodeRestore"; payload: WorkflowNodeRestorePayload }
  ```
- 这让 TypeScript 能在 webview 编译期就约束 `payload` 的字段。

### 2.2 `workflowNodeRestorePayloadSchema`

- **字段**：
  - `snapshotId: string`：被回溯的节点 ID（形如 `taskId#N`）。
  - `taskId: number | undefined`、`taskIdentifier: string | undefined`：任务标识，两者至少填一个。
  - `checkpointTs: number`：checkpoint 时间戳，用于裁剪聊天记录等。
  - `checkpointHash?: string`：可选，用于 UI 一致性（当前 checkpoint 标签）。
  - `strategy: "checkpoint-only" | ...`：恢复策略，目前主要使用 checkpoint-only。
- **意义**：我们在 `WorkflowPanel` 点击“回溯”时构造此 payload，扩展端只接受 schema 校验通过的请求，避免字段缺失或类型错误。

### 2.3 `workflowNodeRestoreResultPayloadSchema`

- **字段**：
  - `status: "success" | "error"`
  - `snapshotId: string`
  - `branchId?: string`：若成功，扩展端可返回新分支 ID。
  - `error?: string`：若失败，提供错误信息。
- **作用**：扩展端执行完回溯后，把结果封装成此结构，再由 `ExtensionMessage` 发送回 webview。我们用它来决定是否 `createBranchFromSnapshot`、是否展示“恢复失败”提示。

## 3. 与 Workflow 逻辑的配合

1. **请求**：WorkflowPanel → `requestWorkflowNodeRestore` → `WebviewMessage`（`workflowNodeRestore`）。
2. **校验 & 执行**：`webviewMessageHandler.ts` 使用 `workflowNodeRestorePayloadSchema`，解析后调用 `ClineProvider.requestWorkflowNodeRestore` / `Task.restoreFromCheckpoint`。
3. **结果**：扩展端将 `workflowNodeRestoreResultPayload` 发送给 webview，`ExtensionStateContext` 根据 `status` 决定是创建新分支还是显示错误。

## 4. 面试讲解要点

- “我们为回溯请求设计了一套严格的 schema，任何字段变化都要先改这里，再同步扩展端与 UI，保证协议不破裂。”
- “WorkflowPanel 的回溯按钮触发 `workflowNodeRestore` 消息，扩展执行完成后通过 `workflowNodeRestoreResult` 告诉我们成功/失败，并附带 `branchId`。”
- “这份文件等同于我们在本地环境里定义的 API 契约，确保前端、扩展、测试共用同一套类型。”
- **源码位置**：两段 schema 都在 `src/shared/WebviewMessage.ts` 约 500 行处，示例：

```ts
export const workflowNodeRestorePayloadSchema = z.object({
	snapshotId: z.string(),
	taskId: z.string(),
	snapshotTs: z.number(),
	checkpointHash: z.string(),
	checkpointTs: z.number().optional(),
	strategy: z.literal("checkpoint-only"),
})

export const workflowNodeRestoreResultPayloadSchema = z.object({
	snapshotId: z.string(),
	status: z.enum(["success", "error"]),
	mode: z.literal("conversation"),
	strategy: z.literal("checkpoint-only"),
	error: z.string().optional(),
})
```

> 因此如果要新增字段，只需修改这段 schema + 对应的 `type`，扩展端与 webview 的校验和类型都会同步更新。
