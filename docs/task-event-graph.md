# `webview-ui/src/utils/taskEventGraph.ts` 详解

## 1. 文件定位

`taskEventGraph.ts` 是 Workflow 可视化的枢纽：它负责把 `ReceivedTaskEvent[]` 转换为 `WorkflowGraphNode[]`，也就是 UI 渲染所需的节点 DAG。可以把它视作“事件聚合层”，将散落的 TaskEvent 汇总成可视化数据结构。

## 2. 核心职责

1. **事件聚合**：
   - 维护 `TaskTimeline`（以 `taskIdentifier` 为 key）。每个 timeline 会缓冲消息、记录父子 task 关系、统计步骤序号。
   - 当捕获到 `checkpoint_saved`（即 `Message` 事件中含 checkpoint hash）时，就把 buffer flush 成一个 `WorkflowGraphNode`。

2. **分支/连接信息**：
   - 利用 `branchId`, `branchParentSnapshotId`, `previousSnapshotId` 描述节点在分支树中的位置。
   - 通过 `TaskDelegated` / `TaskSpawned` / `TaskDelegationCompleted` 等事件维护跨 task 的 `parentIds` / `childIds`。

3. **节点内容**：
   - 把 checkpoint 期间发生的消息/Hook/工具调用整理到 `node.events`，供 UI 展开查看。
   - 记录时间戳、持续时间、模式（mode）、checkpoint hash 等信息。

## 3. 和需求的结合

- **Workflow 树的基础**：WorkflowPanel 渲染时间线/树视图时，就是遍历这个模块生成的 `WorkflowGraphNode[]`。如果想要新字段（比如节点耗时、工具列表），都得在这里先补齐。
- **分支正确性**：`branchParentSnapshotId` 和 `previousSnapshotId` 的计算逻辑决定树是否自洽。我们曾经在这里新增逻辑，保证回溯后派生的节点与父节点正确连接。
- **性能/稳定性**：`taskEventGraph` 是纯函数（根据 `taskEvents` 和 `branchMetadata` 生成节点），便于测试和重建；也是我们能在 UI 中随时“重放” Workflow 的原因。

## 4. 面试讲法建议

- 可以讲自己如何从 `taskEvent` 源数据设计出 `WorkflowGraphNode` 的字段，并解释 `branchId`、`branchParentSnapshotId`、`previousSnapshotId` 的用途。
- 说明为什么需要在 builder 中缓存消息、等待 checkpoint 才生成节点（否则节点粒度太细，无法对齐 checkpoint）。
- 强调这一层是纯逻辑层，UI 只是消费它的结果；这样更能突出架构思考，而不仅仅是写 React。
- 同时可以类比“后端聚合层”：这个模块把事件数据加工成可渲染节点，职责上类似传统后端服务里的聚合/业务处理，这样的比喻能让面试官知道你不仅做 UI，也参与数据层设计。

总之，`taskEventGraph.ts` 让我们从事件流构建出可视化 DAG，是整个 Workflow 系统的“数据引擎”。
