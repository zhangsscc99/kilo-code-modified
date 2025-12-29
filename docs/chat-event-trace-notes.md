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

- 目前面板里的节点、事件列表和 Agent 状态，全部由 `ChatView` 已经拥有的 `clineMessages` 推断出来，没有新的后端接口。我们根据消息的 ask/say 类型以及工具 payload（`tool`、`command_output`、`subtask_result`、`condense_context` 等）将其归类为 agent/tool/subagent/hook，再按时间顺序生成节点或事件条目。
- 因此“节点”并不是实际的 DAG，只是对现有聊天流的可视化封装；视觉上是单列时间线，左侧用彩色圆点与虚线将节点依次连接（agent/工具/子代理/hook 颜色与节点类型一致）。能看到的“真实数据”就是本来就展示在聊天里的工具调用/子任务/Hook 信息。
- 等将来有正式的工作流事件流（例如 RooCode TaskEvent 或其他后端 API）时，可以把 `buildWorkflowNodes` 等推断逻辑替换为真实数据源，这样就能展示准确的拓扑与连线。

### DAG 设计思路（规划中）

- DAG（Directed Acyclic Graph）意味着节点之间有明确的有向边且无环，适合表示“agent → tool → sub-agent”这种流程。真正的 DAG 实现需要后端提供节点 ID 和父子关系，比如 TaskEvent 的 `TaskDelegated`、`TaskToolFailed` 等。前端接入这类数据后，可以构建包含 `nodes`（类型、模式、耗时、文本）和 `edges`（from/to）的结构，再用图布局库绘制连线、支持拖拽缩放。
- 当前版本仅能根据消息的时间顺序临时列出节点，无法推断真实 parent/child，因此只是一个“近似列表”，等拿到官方事件流后再替换实现。

## 4. Agent State 时间线

- UI 会把每次推断出的 Agent 状态 push 到本地数组，并按时间顺序（越下越新）渲染成带连线的列表；每条记录包含状态、模式、任务、消息数和最近事件文本，支持下拉查看全部历史。
- Agent Events 标签同样沿用时间线样式：单列节点按照时间排序，左侧彩色圆点与虚线串联，每条事件展示简要描述和原始 `sourceMessage` JSON，便于调试。
- 以上数据依然来自 `clineMessages` 的推断：当出现新的 ask/say 或工具调用时更新状态、记录消息数、保存最近事件文本。如果后端将来能提供完整的状态/事件日志，也可以替换成更精确的数据源。
