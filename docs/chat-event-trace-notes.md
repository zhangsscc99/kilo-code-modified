# Chat Event Trace Notes

## 1. 这些功能是纯前端代码吗？有涉及后端吗？

是完全前端侧的实现。新增的 `ChatEventTrace` 组件和对应测试都位于 `webview-ui` 中，`ChatView` 只是将它作为 Virtuoso 的 Footer 渲染。扩展端、CLI 或任何后端代码都没有改动，所有数据都来自现有的 `clineMessages`。

## 2. Hook event 指的是什么？

在当前版本里，“hook event” 是为了把系统级事件和普通对话区分而定义的临时分类，主要包括：

- API 请求生命周期：`api_req_started`、`api_req_finished`、`api_req_retried`、`api_req_retry_delayed`、`api_req_deleted` 等。
- 上下文管理与异常：`condense_context`、`condense_context_error`、`sliding_window_truncation`、`condense`、`resume_task`、`resume_completed_task`、`api_req_failed`、`mistake_limit_reached`、`invalid_model`、`payment_required_prompt`、`report_bug` 等。
- 其他系统提示：`browser_session_status`、`shell_integration_warning`、`user_edit_todos` 以及任何附带 `progressStatus` 的 streaming 状态。

这些消息本质上是“内部钩子/系统通知”，既不是 Agent 的自然语言输出，也不是工具调用或子任务的结果，因此单独开辟“hook”类别，后续如接入更标准的事件流可以再细化。

## 3. Workflow 面板的数据是怎么来的？

- 现在的 Workflow 面板直接消费扩展端转发的 `TaskEvent`。扩展端在 `ClineProvider` 中将 `RooCodeEventName` + payload 打包成 `WebviewTaskEvent` 发往 webview，`ExtensionStateContext` 把这些事件落在本地 `taskEvents` 数组，再交给 `buildWorkflowNodesFromTaskEvents` 构建节点。最近一次迭代主要包含：
    1. **节点等于 checkpoint**：构建器会为每个 task 缓存“上次 checkpoint 以来的所有消息/工具事件”，只要捕获到新的 `checkpoint_saved` 消息就将缓存 flush 成一个节点（ID 为 `taskId#checkpoint-N`），节点的 `events` 就代表“这个 checkpoint 之前累计执行过的所有操作”。没有 checkpoint 的任务会显示“暂无 checkpoint 数据”。
    2. **面板可缩放、默认更宽大**：Workflow 面板默认尺寸放大到原来的约 1.3 倍，并支持沿右边 / 底部 / 右下角拖拽调整宽高，以容纳更多按钮和节点。
    3. **节点卡片尺寸微调**：单个节点卡片的宽度相当于父容器的 88%，展开的内部事件也沿用同样宽度，让面板内容紧凑且易读。
- TaskCompleted/TaskAborted 会把最后一个 snapshot 的 `completedAt` 结束时间补全；`TaskModeSwitched` 更新节点的 mode/label；Subagent（即 `TaskDelegated`/`TaskSpawned` 的 child task）继续作为独立节点存在：事件里带着 child taskId，构建器创建子节点并通过 parentId 与父节点连线。

### DAG 设计思路（进行中）

- DAG（Directed Acyclic Graph）意味着节点之间有明确的有向边且无环，适合表示“agent → tool → sub-agent”这种流程。现在我们已经拥有 TaskEvent 数据和父子 taskId，所以可以构建真实节点，但仍需改进“一个节点囊括多个步骤”的行为。
- agent 每保存一次 checkpoint，就会生成一个新的节点；节点之间按 checkpoint 序号顺序串联，便于理解从旧 checkpoint 到新 checkpoint 之间发生的所有写操作。
- TaskDelegated / TaskSpawned / TaskDelegationResumed / TaskDelegationCompleted 事件仍然继续用于创建跨 task 的父子节点，所以多层 subagent 会自然显示为树状结构。

#### 数据来源与状态流

1. **TaskEvent / RooCode 事件流（当前实现）**

    - 扩展端监听 TaskEvent，并通过 `ExtensionMessage` 类型 `taskEvent` 推送给 webview。payload 中包含 `eventName`, `payload`, `taskId`, `taskIdentifier`, 以及必要的 parent/child ids。
    - Webview 缓存这些事件，并在 Workflow 面板中实时映射为节点/边。Agent/工具/hook 的颜色、节点展开详情等都基于这份数据。
    - 后续支持“节点回档 + 继续推演”时，可直接利用节点上的 taskId 调用扩展端的 checkpoint 恢复逻辑。

2. **Kilocode Agent Manager 状态（备用）**
    - 仍可作为补充信息，例如展示代理集群里不同角色的状态；但 DAG 主体以 TaskEvent 为准。

## 4. Agent State 时间线

- UI 会把每次推断出的 Agent 状态 push 到本地数组，并按时间顺序（越下越新）渲染成带连线的列表；每条记录包含状态、模式、任务、消息数和最近事件文本，支持下拉查看全部历史。
- Agent Events 标签同样沿用时间线样式：单列节点按照时间排序，左侧彩色圆点与虚线串联，每条事件展示简要描述和原始 `sourceMessage` JSON，便于调试。
- 以上数据依然来自 `clineMessages` 的推断：当出现新的 ask/say 或工具调用时更新状态、记录消息数、保存最近事件文本。如果后端将来能提供完整的状态/事件日志，也可以替换成更精确的数据源。

## 5. 节点回档/继续推演能力（规划）

- 长期目标是做到“点击任意节点 → 展开详情 → 在该节点状态基础上继续聊天并生成新的分支”，类似游戏回档。实现前提：节点必须绑定真实的 `taskId`/`checkpointId`，点击后可调用扩展端已有的 checkpoint 恢复逻辑。
- 这也是为何推荐接入 TaskEvent：一旦 DAG 基于真实的任务事件构建，节点就天然对应具体 task，可与文件系统 checkpoint、聊天记录 checkpoint、agent memory 同步回档。也方便在 UI 中展示“来自 triage agent 的分支”之类的交互。

### 当前阶段的实施计划（不含回档）

1. **扩展端**：监听 TaskEvent 并通过 `ExtensionMessage` 将事件推送到 webview，每条事件至少包含 `eventName`, `payload`, `taskId`, `parentTaskId`、`childTaskId`（若有）。
2. **Webview 状态层**：新建一个 store/atom，缓存 TaskEvent 并构建 `nodes` + `edges` 数据结构。每个节点代表一个 Agent（或子任务），内部关联发生的 tool/hook 事件，且记录 `taskId`、持续时间、模式等信息。
3. **WorkflowPanel UI**：
    - 使用上述 DAG 数据渲染真实的节点列表（初期可继续使用纵向时间线形式）。
    - 节点可点击展开详情（展示工具、Hook、时间、模式等），但暂不触发回档，仅用于查看。
    - 现有 Agent State / Agent Events 标签继续复用消息推断，待 TaskEvent 数据完整后逐步迁移。
4. **文档 / 测试**：记录 TaskEvent 接入方式，确保 WorkflowPanel 的渲染测试基于模拟 TaskEvent，而不是 `clineMessages`。

未来在此基础上再接入“节点回档 + 继续推演”，届时只需在节点详情中添加回档入口，并复用已有的 `taskId` 元数据。

## 6. Workflow 面板的 checkpoint-only 回溯（实验分支）

- **节点识别与样式**：`webview-ui/src/utils/taskEventGraph.ts` 会把 `say:checkpoint_saved` 的消息记到 snapshot 上，节点对象会附带 `checkpoint.hash/ts` 和 `supportsCheckpointRestore`。在 UI (`WorkflowPanel.tsx`) 里，只有这些节点会显示橙色边框和 “Checkpoint” 徽章，并在展开后渲染“回溯到 checkpoint”按钮；为了避免误导，按钮会在有 pending 请求时禁用并显示文本 `回溯中...`。
- **消息协议**：Workflow 面板点击回溯会通过 `workflowNodeRestore` 消息发到扩展，payload 包含 `snapshotId/taskId`、`snapshotTs`、`checkpointHash`、可选 `checkpointTs`，并固定 `strategy: "checkpoint-only"`。扩展端 (`webviewMessageHandler.ts`) 会先 `showTaskWithId`，然后执行 `cancelTask → waitFor 初始化 → checkpointRestore`，结束后用 `workflowNodeRestoreResult` 回传。该 result payload 携带 `snapshotId`、`status`、`mode: "conversation"`、`strategy: "checkpoint-only"` 以及可选 `error` 字符串。
- **状态同步**：`ExtensionStateContext` 维护 `workflowRestoreState`（pending 节点、最近成功节点、错误信息）并缓存最近一次请求 payload。收到 `workflowNodeRestoreResult` 时，如果成功，会用缓存里的 `checkpointTs/snapshotTs` 裁剪本地 `taskEvents` 和 `clineMessages` 数组，确保回滚后的节点链与聊天区一致；失败则把错误文案绑定到对应节点。
- **聊天 checkpoint 同步**：只有真正落地了 `checkpoint_saved` 的节点才可点击，Workflow 面板还会用 `currentCheckpoint`（扩展侧 real-time 推送）标记“当前 checkpoint”提示，以提醒用户该节点和聊天侧的 checkpoint 状态完全一致。

## 7. Checkpoint 工作原理简述

- **触发入口**：当 webview 发送 `type:"askResponse", askResponse:"messageResponse"`（`webview-ui/src/components/chat/ChatView.tsx`）时，`Task.handleWebviewAskResponse` 会调用 `this.checkpointSave(force, suppress)`（`src/core/task/Task.ts`），把本轮用户回复和 shadow git 同步。首条 `newTask` 消息不会经过这个入口，如需对话一开始就落 checkpoint 需要另行调用。
- **需要 Git 与 workspace**：`checkpointSave` 内部先执行 `getCheckpointService`（`src/core/checkpoints/index.ts`）。该函数会检查当前任务是否启用了 checkpoints、是否能拿到 workspace 路径和 `context.globalStorageUri`，并确认本机安装了 Git、工作区没有嵌套仓库。如果任一条件失败，会把 `task.enableCheckpoints` 设为 `false` 并直接返回；因此只有“在真实工作区里 + Git 可用”时才会继续。
- **影子仓库提交流程**：通过 `RepoPerTaskCheckpointService` 创建出的 `ShadowCheckpointService` 会在扩展全局存储目录下建一个独立 git 仓库（`.../tasks/<taskId>/checkpoints`），用 `core.worktree` 指向当前 workspace。`saveCheckpoint` 会先 `git add` 工作区（遵守 `.git/info/exclude`），然后执行 `git commit` 或 `git commit --allow-empty`（取决于 `force` 参数），最后把 `checkpoint_saved` 事件抛给扩展/webview。带 `suppressMessage: true` 的 checkpoint 仍会保存，只是 chat view 过滤掉提示。
- **回溯/展示**：扩展端在收到 `checkpoint` 事件时，会给 webview 发送 `currentCheckpointUpdated` 并写入 `clineMessages`，Workflow 面板也据此打上可回溯标记。只要 shadow repo 还在，可通过 `checkpointRestore`（同文件）把工作区和聊天历史回滚到指定提交。

## 8. 多分支树形 Workflow

- **节点与分支标识**
  - `buildWorkflowNodesFromTaskEvents`（`webview-ui/src/utils/taskEventGraph.ts`）现在会把 `branchId`、`branchParentSnapshotId` 与 `previousSnapshotId` 写进 `WorkflowGraphNode`，默认分支为 `branch-main/Branch A`。恢复成功后，webview 根据点击的节点在 `ExtensionStateContext` 中创建新的分支元数据（`workflowBranches`），并将后续 `TaskEvent` 标记到当前 active branch。
  - 每次捕获 `checkpoint_saved` 消息时，`ExtensionStateContext` 会更新 `snapshotBranchAssignmentRef` 和 per-task 计数器，让 snapshot ID（`taskId#N`）与分支一一对应，后续的 `workflowNodeRestoreResult` 也能根据这个索引创建正确的子分支。

- **状态同步**
  - `ExtensionStateContext` 暴露 `workflowBranches` 和 `activeWorkflowBranchId`（`webview-ui/src/context/ExtensionStateContext.tsx`）。`workflowNodeRestoreResult` 成功后不再裁剪 `taskEvents`，而是把旧分支标记为 `archived`，并新建一个状态为 `active` 的分支，供后续事件继续写入。
  - `ReceivedTaskEvent` 新增 `branchId` 字段（`webview-ui/src/types/taskEvents.ts`），`taskEvent` 消息在入队时自动写入当前 active branch，从而让 builder/测试都能准确区分不同分支的事件。

- **UI 结构（WorkflowPanel）**
  - Workflow tab 顶部新增 “全部分支” 快捷按钮，同一块卡片里继续列出每条分支的来源 checkpoint、节点数量和运行状态（当前分支显示绿色“当前运行”）。点击普通分支按钮会进入时间线视图，而选择“全部分支”会展开树状思维导图。
  - 树状视图按照 `workflowBranches.parentBranchId` 递归渲染，分支卡片使用 `border-l` 缩进显示父子关系，节点卡片沿用时间线的 UI，但根据深度调节缩进。`selectedBranchLabel` 也会在标题旁更新为 “全部分支”。
  - “回溯到 checkpoint” 按钮在两种视图下都会携带 `{ branchId }` 元数据调用 `requestWorkflowNodeRestore`，回溯成功后始终从所选节点派生新分支，旧分支留作可视化历史。

- **后续可扩展项**
  1. 在 `workflowBranches` 中记录用户可见颜色/徽章，让 DAG 视图或节点列表能快速区分不同分支。
  2. 加入分支归档/重命名/删除 API，并把这些操作同步到扩展端的历史存档。
  3. 复用 checkpoint diff 能力提供分支对比（例如 Branch A vs Branch B 的文件差异），方便挑选合适的分支继续推演。
