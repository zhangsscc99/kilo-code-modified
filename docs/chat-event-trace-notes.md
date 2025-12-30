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

- 现在的 Workflow 面板直接消费扩展端转发的 `TaskEvent`。扩展端在 `ClineProvider` 中将 `RooCodeEventName` + payload 打包成 `WebviewTaskEvent` 发往 webview，`ExtensionStateContext` 把这些事件落在本地 `taskEvents` 数组，再交给 `buildWorkflowNodesFromTaskEvents` 构建节点。
- `buildWorkflowNodesFromTaskEvents` 现在会为每个 task 维护一条事件时间线：一旦捕获到新的 agent `Message`，就复制当前时间线的数据生成新的 snapshot（ID 为 `taskId#step`），并把这一刻的内部事件写进节点，形成“节点随着步骤增加逐渐成长”的链式效果。
- TaskCompleted/TaskAborted 会把最后一个 snapshot 的 `completedAt` 结束时间补全；`TaskModeSwitched` 更新节点的 mode/label。
- Subagent（即 `TaskDelegated`/`TaskSpawned` 的 child task）继续作为独立节点存在：事件里带着 child taskId，构建器创建子节点并通过 parentId 与父节点连线。

### DAG 设计思路（进行中）

- DAG（Directed Acyclic Graph）意味着节点之间有明确的有向边且无环，适合表示“agent → tool → sub-agent”这种流程。现在我们已经拥有 TaskEvent 数据和父子 taskId，所以可以构建真实节点，但仍需改进“一个节点囊括多个步骤”的行为。
- agent 每出现一个新增步骤（Message / Hook 等会进入 `messages` 列表），构建器都会复制当前时间线生成新的 snapshot 节点，节点之间按 step 号顺序串联，便于理解推理轨迹。
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
