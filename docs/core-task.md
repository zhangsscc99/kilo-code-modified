# `src/core/task/Task.ts` 详解

> 本文从扩展架构视角梳理 `Task.ts` 的角色、关键方法以及它与 Workflow 可视化之间的联系。

## 1. 文件定位

`src/core/task/Task.ts` 位于扩展端的核心目录，是 VS Code 扩展里每个“会话/任务”的控制器。无论是 CLI、代理推理还是 webview 交互，最终都要落在某个 `Task` 实例上，这个实例负责维护：

- 当前任务的上下文、模式（triage/code/document 等）。
- 对接工具、MCP、子任务的生命周期。
- checkpoint 的保存/恢复逻辑。
- 与 webview 的事件通信（如 `checkpoint_saved`、`workflowNodeRestoreResult`）。

因此它既是“扩展端后端”的入口，也是 Workflow 可视化能否拿到正确事件流的关键。

## 2. 关键职责

### 2.1 Checkpoint Save

- `handleWebviewAskResponse` 会在 webview 发送消息（askResponse）后调用 `checkpointSave(force, suppress)`: 
  - 检查任务是否支持 checkpoint（Git 是否可用、是否在真实 workspace 等）。
  - 调用 `src/core/checkpoints` 的保存函数，将当前 workspace + 聊天内容写入 shadow repo。
  - 保存成功后向 webview 推送 `checkpoint_saved` 事件，这就是 Workflow 节点的触发源（`taskEventGraph` 会根据这些事件构建节点）。

### 2.2 Checkpoint Restore

- 当 webview 调用 `requestWorkflowNodeRestore` 时，扩展端会把请求路由到 `Task.restoreFromCheckpoint`。
- 恢复成功后，`Task` 会：
  1. 通过 `workflowNodeRestoreResult: success` 告知 webview 新的 branch 信息和 `snapshotId`。
  2. 写回 `currentCheckpointUpdated`，让 UI 知道当前 checkpoint hash。
  3. 根据需要更新任务状态/上下文。
- 这一步正是“回溯 = 新分支起点”的触发器，webview 收到成功回调后会创建新的 `workflowBranches` 项。

### 2.3 事件转发与状态同步

- `Task` 会在内部各种行为（工具调用、MCP 回调、子任务创建）的关键节点上调用 `this.emitTaskEvent(...)`，最终由 `src/extension.ts` 中的消息路由发送给 webview。
- Workflow 面板依赖的 `TaskEvent`、`TaskModeSwitched`、`TaskDelegated` 等都来自这里。

## 3. 与 Workflow 可视化的关系

1. **事件源**：`Task.ts` 是 webhook 式的事件源头，任何 checkpoint 相关事件都从这里传往 webview。
2. **分支触发**：回溯成功后，`Task` 推送的 `workflowNodeRestoreResult` 是新分支诞生的信号；webview 根据这个结果更新 `workflowBranches`。
3. **错误兜底**：若恢复失败，`Task` 会返回 `workflowNodeRestoreResult: error`，面板据此展示“恢复失败”提示并保留错误信息。

## 4. 常见注意事项

- **不要静默失败**：任何 checkpoint 操作如果失败，应确保 `workflowNodeRestoreResult` 或其他错误事件被发到 webview，否则 UI 会卡在 loading 状态。
- **事件一致性**：`Task` 发出的事件结构必须与 `webview-ui/src/types/taskEvents.ts` 定义匹配；字段缺失会导致前端构建节点时出错。
- **性能考量**：Checkpoint Save 依赖 Git 操作，应避免在 UI 线程执行阻塞逻辑。`Task.ts` 已把重活交给后台 Promise，但仍需关注大仓库时的耗时。

## 5. 后续可扩展点

- 支持更多 checkpoint 策略（例如差分保存、自动 save 频率配置）。
- 在 `workflowNodeRestoreResult` 中携带更多元数据（如文件 diff、耗时），便于 Workflow 面板展示更丰富的信息。
- 与远程代理/云端服务协作时，可在 `Task.ts` 层做进一步封装，保证 webview 协议不受影响。

综上，`src/core/task/Task.ts` 是 Workflow 系统背后最关键的“后端”角色，它把扩展端的真实执行流程转译成 webview 能消费的事件流，使得节点可视化、分支管理得以实现。

## 6. 与本次 Workflow 需求相关的前/后端职责划分

下表概括了“动态 Workflow 轨迹追踪”涉及的主要文件，以及它们处于前端（webview）还是后端（扩展）视角：

| 层级 | 文件 / 模块 | 作用 | 本质职责 |
|------|-------------|------|-----------|
| 后端 | `src/core/task/Task.ts` | 管理任务生命周期、触发 checkpoint save/restore、向 webview 推送 `checkpoint_saved`/`workflowNodeRestoreResult` 等事件 | **真正执行业务逻辑**：调用 checkpoint 服务、决定何时发事件，是本地后端核心 |
| 后端 | `src/core/checkpoints/index.ts` | 操作 shadow repo：保存/恢复 Git 提交，并把结果封装成事件 | **存储层**：提供 checkpoint 数据源 |
| 后端 | `src/extension.ts` 及相关 Message Router | 将来自 `Task.ts` 的事件转发给 webview；接收 webview 请求并调用 `Task` | **本地 RPC**：维持前后端协议 |
| 前端（协议层） | `webview-ui/src/types/taskEvents.ts` | 定义 `ReceivedTaskEvent`、`WorkflowBranchInfo` 等类型 | **API 契约**：确保消息字段一致 |
| 前端（协议层） | `webview-ui/src/context/ExtensionStateContext.tsx` | 监听 `window.postMessage`，存储 `taskEvents`、`workflowBranches`，提供 `requestWorkflowNodeRestore` | **本地状态机**：相当于客户端后端 |
| 前端（协议层） | `webview-ui/src/utils/taskEventGraph.ts` | 把 `taskEvents` 聚合成 `WorkflowGraphNode[]` | **聚合层**：把事件流变成节点树 |
| 前端（UI） | `webview-ui/src/components/chat/WorkflowPanel.tsx` | 渲染 Workflow/Agent 状态视图 | **展示层**：与用户交互 |

> 因为 VS Code 扩展没有传统的客户端/服务端分界，这里把“扩展内部逻辑 + shadow repo 操作”统称为本地后端，而 webview 内的 `context + utils` 则承担客户端后端/协议层角色，最终由 React 组件完成 UI 呈现。
