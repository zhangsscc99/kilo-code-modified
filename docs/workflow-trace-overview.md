# 动态 Workflow 轨迹追踪系统概览

下面整理了近期 Git 历程中围绕“动态 Workflow 节点可视化”所做的主要工作，方便快速理解整个系统的架构、分支管理逻辑以及后续可扩展点。

## 1. 目标与总体思路

- **可视化 Agent 执行轨迹**：将扩展端推送的 `TaskEvent` 构建成具有时间顺序、分支层级的节点图，支持回溯、查看内部事件日志等操作。
- **分支自洽**：每次用户回溯成功，就从对应 checkpoint 派生一条新分支，保证 Workflow 树始终与真实操作一致。
- **多视图体验**：Workflow 面板提供“时间线”“Agent 状态”“Agent 事件”三种 Tab，并支持在 Workflow Tab 中切换单分支列表或“全部分支”树状视图。

## 2. 数据来源与节点构建（`webview-ui/src/utils/taskEventGraph.ts`）

1. **事件输入**：所有 `TaskEvent` 都会带上 `branchId`、`taskId`、`taskEventTimestamp` 等信息，进入 `buildWorkflowNodesFromTaskEvents`。
2. **节点生成逻辑**：
   - 遇到 `checkpoint_saved` 消息就 flush 当前 buffer，生成一个 `WorkflowGraphNode`，带上 `branchId`、`branchParentSnapshotId`、`previousSnapshotId` 等字段。
   - `parentIds/childIds` 由 `TaskDelegated/TaskSpawned` 等事件维护，方便渲染跨 task 的 DAG。
   - 节点的 `events` 列出 checkpoint 之间发生的每条内部消息，供 UI 展开查看。
3. **分支关联**：在 builder 里，`branchParentSnapshotId` 会指向“该分支从哪个 checkpoint 分叉”，树视图就是靠这个字段 + `previousSnapshotId` 复原出父子关系。

## 3. 状态管理（`webview-ui/src/context/ExtensionStateContext.tsx`）

- **核心状态**：`workflowBranches`、`activeWorkflowBranchId`、`taskEvents`、`workflowRestoreState`、`snapshotBranchAssignmentRef` 等。
- **回溯 -> 新分支**：
  1. 点击节点“回溯”时，`requestWorkflowNodeRestore` 把 `{ snapshotId, branchId }` 发给扩展。
  2. 回溯成功回调后，`createBranchFromSnapshot` 以该 snapshot 为 `parentSnapshotId` 创建新分支、标记旧分支为 `archived`，并切换 `activeWorkflowBranchId`。
  3. 后续 `taskEvent` 便自动带上新的 `branchId`。
- **事件保留策略**：曾经为了节省内存使用 `.slice(-500)` 截断 `taskEvents`，导致老节点重新构建时丢失；现已改为完整保留，确保 Workflow 树不会“吃”掉历史 checkpoint。

## 4. UI 交互（`webview-ui/src/components/chat/WorkflowPanel.tsx`）

1. **布局**：
   - 面板顶部 Tab 控制 Workflow / Agent State / Agent Events。
   - Workflow Tab 左侧列出所有分支（带节点数量、运行状态），支持切换或选择“全部分支”。
2. **单分支时间线**：
   - 节点按时间逆序排列，左侧竖线 + 圆点展示进度。
   - 点击节点可展开内部事件、执行“回溯到 checkpoint”。
3. **全部分支树视图**：
   - 使用 `treeLayout` 计算节点坐标和折线连结，展示真正的树状结构。
   - 节点卡片显示 `Branch` 标签 + 截断 hash + 标题。默认蓝色边框，hover 时使用橙色，连线颜色与时间线一致。
   - 点击树节点会跳回对应分支的时间线（`handleTreeNodeSelect`）。
4. **辅助 UI**：Agent State 记录状态变化历史；Agent Events 以时间线形式展示 Hook/工具事件。

## 5. 测试与验证

- 单元测试集中在：
  - `webview-ui/src/utils/__tests__/taskEventGraph.spec.ts`：验证节点构建、分支字段等逻辑。
  - `webview-ui/src/components/chat/__tests__/WorkflowPanel.spec.tsx`：覆盖 Workflow 面板渲染、Tab 切换、树视图交互等。
- 执行命令：
  ```bash
  cd webview-ui && pnpm test src/components/chat/__tests__/WorkflowPanel.spec.tsx src/utils/__tests__/taskEventGraph.spec.ts
  ```

## 6. 近期修复/迭代摘要

- **节点消失问题**：去掉 `taskEvents` 的 500 条裁剪，保证历史 checkpoint 不被丢弃；在文档中记录了排查过程。
- **树视图样式**：
  - 增加整体 padding，避免第一列节点贴边。
  - 折线改成 90° + 圆角，颜色统一为蓝色系，hover 时节点边框高亮橙色。
  - 节点卡片增加行间距、hash 截断，视觉更紧凑。

## 7. 后端/扩展端相关文件

虽然 Workflow 可视化主要在 webview 内实现，但以下扩展端文件是数据和行为的来源：

1. `src/core/task/Task.ts`
   - 管理单个任务的生命周期，包括 `checkpointSave`/`checkpointRestore` 等能力。
   - 在保存/恢复 checkpoint 时会产出 `checkpoint_saved`、`workflowNodeRestoreResult` 等消息，最终通过扩展与 webview 交互。
2. `src/core/checkpoints/index.ts`
   - 封装 checkpoint 服务（Shadow Repo）与 Git 操作。`saveCheckpoint`/`restoreCheckpoint` 等逻辑都在这里触发，并将结果封装为 `TaskEvent`/`currentCheckpointUpdated` 消息。
3. `src/extension.ts`（以及消息路由相关文件）
   - VS Code 扩展的入口，负责监听 CLI/Agent 侧的事件并转发给 webview，例如 `taskEvent`、`workflowNodeRestoreResult`、`currentCheckpointUpdated` 等。

这些文件构成了“后端”部分：它们决定什么时候触发 checkpoint、如何执行回溯，以及最终把消息发到 webview。前端的 WorkflowPanel 则负责接收这些消息、维护本地状态并渲染 UI。

## 8. 关键文件详解（本地“后端” + Webview 协议层）

> 以下描述均以“逻辑层”视角解读，每段约 200–300 字，帮助理解这些文件在整个 Workflow 系统中的职责。

### `src/core/task/Task.ts`

该文件是扩展端的任务大脑。每个 Agent 任务都会对应一个 `Task` 实例，负责串联上下文、工具调用和 checkpoint 行为。`Task.handleWebviewAskResponse` 会在用户发送新消息时触发 `checkpointSave`，而 `Task.restoreFromCheckpoint` 则在 webview 请求回溯时调用。实现上，它会依据当前任务状态决定是否允许 checkpoint，并借助 `src/core/checkpoints` 的服务读写 shadow repo。更重要的是，本文件决定了何时向 webview 回传 `checkpoint_saved`、`workflowNodeRestoreResult` 等事件。可以把它视作“后端工作流引擎”的指挥中心——一方面对接 CLI/代理逻辑，另一方面把关键里程碑转化为 Webview 可消费的事件流。

### `src/core/checkpoints/index.ts`

这里封装了 shadow repo 的全部细节：如何在 VS Code 全局目录下创建每个任务独立的 git 仓库、如何把当前 workspace 映射成 worktree、又如何在回溯时 checkout 旧提交。`saveCheckpoint`、`restoreCheckpoint`、`listCheckpoints` 等 API 都在此实现。每次保存成功之后，它会构造 `checkpoint_saved` 消息并交给 `Task` 去广播；恢复时则会写回文件系统，同时生成 `currentCheckpointUpdated` 等状态通知。虽然这些操作发生在扩展侧，但对 webview 来说，就像在和一个本地 HTTP API 通信——checkpoint 服务就是“后端存储层”。

### `src/extension.ts`

这是 VS Code 扩展的入口，主要职责是消息转发与会话管理。它监听 CLI / Agent / Task 侧的事件（包括 `TaskEvent`、`checkpoint`、`workflowNodeRestoreResult`），并通过 `vscode.postMessage` 将结构化数据推送进 webview。反过来，webview 触发的操作（如 `workflowNodeRestore`）也要由这里接收，再调用 `Task` 或 checkpoint 服务去执行。可以把它理解为“本地 RPC 服务”的代理层，负责维持 webview 与扩展核心逻辑之间的协议一致性、权限控制以及错误兜底。

### `webview-ui/src/types/taskEvents.ts`

虽然位于 webview 目录，但它定义了扩展与前端共享的事件协议。这里声明了 `ReceivedTaskEvent`、`WorkflowBranchInfo` 等接口，明确每条事件需要包含的 `eventName`、`payload`、`branchId`、`taskEventTimestamp` 等字段。所有消息都会先映射到这些类型，再被 `taskEventGraph` 等模块消费。由于扩展端并无 HTTP 层，类型定义成了事实上的“API 契约”。维护该文件实际上就是在维护前后端的协议稳定性，每次字段调整都必须同步更新扩展逻辑。

### `webview-ui/src/utils/taskEventGraph.ts`

这是 Workflow 可视化的核心转换器。它接收 `ReceivedTaskEvent[]`，按 task/branch 分组缓存消息，当检测到 `checkpoint_saved` 时就生成一个 `WorkflowGraphNode`，内部记录了步序、持续时间、内部事件、`branchParentSnapshotId`、`previousSnapshotId` 等信息。可以把它视为“本地后端”的聚合层：负责把细粒度的事件流汇总成可渲染的节点 DAG，同时保持 branch lineage 的正确性。对树视图而言，`branchParentSnapshotId` 就是判断是否分叉的关键。

### `webview-ui/src/context/ExtensionStateContext.tsx`

该文件承担了 webview 的状态仓库角色，也是“本地后端”的状态机。它实时监听 `window.postMessage`，把扩展推来的事件写入 `taskEvents`、`workflowBranches`、`workflowRestoreState` 等 state，并提供 `requestWorkflowNodeRestore` 等操作接口给 UI 调用。这里还维护了 snapshot → branch 的映射、分支计数器、当前 checkpoint 等元信息。可以说，整个 WorkflowPanel 的数据都要经过这个 context 才能消费；一旦它的逻辑出 bug（例如之前的 500 条裁剪），UI 立刻就会出现节点缺失、分支不一致等问题。

### `webview-ui/src/components/chat/WorkflowPanel.tsx`

最终的呈现层。它在 `useMemo` 中调用 `buildWorkflowNodesFromTaskEvents` 得到节点列表，提供“单分支时间线”与“全部分支树形”两种视图；左侧还有分支列表与 Agent 状态/事件 Tab。核心交互包括：点击节点查看详情、执行回溯（会调用 context 暴露的 `requestWorkflowNodeRestore`）、在树视图中切换分支、Agent 状态时间线等。该文件还负责各种 UI 细节（拖拽面板大小、树布局、节点 hover 视觉），但本质上它是整个工作流系统对用户的唯一入口。

## 9. 未来可扩展点

- **长期存储**：如果担心 `taskEvents` 无限增长，可将旧事件写入 IndexedDB 或按 checkpoint 批量归档，但务必保留生成节点所需的最小信息。
- **分支元数据增强**：例如记录每个分支的颜色/徽章、节点总耗时等，树视图可以用颜色区分主干与分支。
- **更丰富的交互**：如在树视图里直接回溯、合并/归档分支、节点间的 Diff 预览等。

以上内容覆盖了近期 Git log 中涉及的关键改动，可作为“动态 Workflow 轨迹追踪”系统的工程说明与设计背景。若有新的迭代，可在此文档继续补充。

## 10. Agent 生成/调用 AI API 的代码位置

Workflow 系统与模型调用虽然逻辑不同层，但为了方便面试说明“我也参与了 Agent 生成侧”，可以指向以下模块：

- `src/api/providers/`：
  - 目录下每个文件（如 `openai.ts`, `anthropic.ts`, `groq.ts`, `openrouter.ts` 等）都实现了 `BaseProvider` 接口，负责拼装请求体、发起 HTTP 请求并处理流式响应。
  - 这段逻辑就是 Agent 生成代码的“驱动层”——`Task` 在执行 `generateResponse`/`toolcall` 时最终会调用对应的 provider。
  - 示例：`src/api/providers/openai.ts` 调用 OpenAI REST API；`src/api/providers/openrouter.ts` 则处理多模型路由和 API Key 逻辑。
- 配置路径：
  - `src/core/environment/getEnvironmentDetails.ts`、`src/shared/ExtensionMessage.ts`、`webview-ui/src/context/ExtensionStateContext.tsx` 等处定义了模型、API key 和 provider 的同步方式；webview 里的 ChatView/WorkflowPanel 只是消费这些请求结果。

> 面试时可以强调：即便我主要负责 Workflow 可视化，也熟悉 Agent 生成的底层调用链（`Task` -> provider -> AI API）。

### 示例：OpenAI Provider

- 文件：`src/api/providers/openai.ts`
- 核心步骤：
  1. 继承 `BaseOpenAICompatibleProvider`，实现 `complete`/`stream` 方法。
  2. 组装请求体：prompt、文件上下文、工具描述、temperature、maxTokens 等。
  3. 使用 `fetchWithRetry` 发送 HTTP 请求，处理状态码、流式 chunk。
  4. 把模型输出通过事件流回传给 `Task`，最终进入 Workflow 事件系统。
- 面试点：可说明自己了解模型调用的参数调优、错误重试策略等。

### 示例：OpenRouter Provider

- 文件：`src/api/providers/openrouter.ts`
- 作用：封装多模型路由、API key、meta 信息，支持在一个接口下切换 OpenAI、Mistral、Google 等模型。
- 特性：
  - 支持 per-request 模型选择和 fallback。
  - 与 `getEnvironmentDetails` / webview 设置面板配合，让用户在 UI 中切换模型。
- 面试点：可说明如何在 VS Code 扩展里做“模型抽象层”，以及你如何在 Workflow 系统中读取这些信息（例如节点标签显示当前模式）。
