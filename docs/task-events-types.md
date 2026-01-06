# `webview-ui/src/types/taskEvents.ts` 详解

## 1. 文件定位

`taskEvents.ts` 位于 webview 端，但扮演“协议层”的角色：它为 `WebviewTaskEvent` 增加了 UI 层需要的类型信息，并定义了 Workflow 在前端处理 `taskEvent` 时所需的接口与辅助类型。可将其理解为 “taskEvent 协议的 webview 侧映射”。

## 2. 关键类型

1. **`ReceivedTaskEvent`**：
   - 基于扩展端发来的 `WebviewTaskEvent`，加入了 `branchId?: string`、`taskEventTimestamp: number` 等字段。
   - 我们在 `ExtensionStateContext` 收到 `taskEvent` 消息后，就把它强类型化成 `ReceivedTaskEvent`，方便 `buildWorkflowNodesFromTaskEvents` 使用。

2. **`WorkflowGraphNode` 辅助类型**（若在文件中导出）：
   - 描述 Workflow 节点需要的字段（`id`, `taskId`, `branchId`, `events`, `checkpoint`, `supportsCheckpointRestore` 等）。
   - 虽然真正的节点定义在 `taskEventGraph.ts`，但 `taskEvents.ts` 为其提供了类型来源。

3. **`WorkflowBranchInfo` / `WorkflowRestoreStateSnapshot`**（如果由此 re-export）：
   - 与 `ExtensionMessage.ts` 保持一致，确保 webview 内同样使用强类型。

## 3. 和需求的关联

- **安全解析**：一旦 `taskEvent` 进入 webview，我们会立即映射成 `ReceivedTaskEvent`，保证 `branchId`, `taskEventTimestamp` 等字段在 UI 层可用。Workflow 构建器、UI 都依赖这些字段进行分支划分、排序。
- **可维护性**：如果扩展端新增事件类型（例如未来的 `TaskRetry`），我们会在 `taskEvents.ts` 中更新对应的 TypeScript 类型，这样 `taskEventGraph`、`WorkflowPanel` 就能立即得到编译时提示，确保协议一致。

## 4. 面试讲法建议

- 可以强调：“我们把扩展端的 `taskEvent` 协议在 webview 中也做了类型化，Workflow 构建器不会直接处理 `unknown` payload，而是根据这里定义的结构安全地提取 `branchId/previousSnapshotId` 等关键信息。”
- 也可说明你对 TypeScript 类型系统的运用：借助 `type`/`interface`/`z.infer` 让协议从扩展到 webview 全程有静态检查。
- 还可以类比“传统后端 schema”：虽然这些类型定义在前端，但它们承担的职责与后端 API schema 相同——约束数据结构、保证协议一致。强调这一点能让面试官知道你在前端也关注协议/数据层。

总之，`taskEvents.ts` 是 Workflow 系统的“类型桥梁”，保障 `taskEvent` 在 webview 端使用时既安全又易维护。
