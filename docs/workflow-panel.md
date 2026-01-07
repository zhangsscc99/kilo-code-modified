# `webview-ui/src/components/chat/WorkflowPanel.tsx` 详解

## 1. 组件定位

WorkflowPanel 是 VS Code 扩展里显示动态 Workflow 的主界面，它集成了三大 Tab：

1. **Workflow**：展示分支列表、单分支时间线、全部分支树形视图，并提供节点回溯按钮。
2. **Agent State**：记录代理状态（Streaming/Idle/Paused 等）的时间线。
3. **Agent Events**：展示 Hook/工具事件的时间线（类似审计日志）。

本文件负责所有 UI 的渲染、交互逻辑（折叠、拖拽 panel 大小、节点展开等）。

## 2. 与 Workflow 需求最相关的逻辑

### 2.1 分支选择 / 全部分支树视图

- `workflowBranches`、`selectedBranchId` 控制当前视图显示哪条分支。默认跟随 `activeWorkflowBranchId`，也可手动选择。
- “全部分支”按钮会切换到树状视图：
  - 使用 `treeLayout` 计算节点坐标，画出折线连结（蓝色默认、hover 时节点橙色高亮）。
  - 树节点点击后调用 `handleTreeNodeSelect`，设置 `selectedBranchId`、`activeNodeId`，并回到时间线视图。
  - 树节点显示 `Branch label + hash + 标题`，回溯按钮则在展开后的详情里。

### 2.2 单分支时间线

- 使用 `visibleNodes`（按 `selectedBranchId` 过滤的 `WorkflowGraphNode[]`）渲染竖向时间线，左侧圆点 + 虚线展示顺序。
- 每个节点可点击展开详情：
  - 内部事件 (`node.events`) 列表。
  - “回溯到 checkpoint”按钮，调用 `onRestoreNode`，并附带 `branchId` 元数据。
  - 显示当前 checkpoint、错误、持续时间等信息。

### 2.3 交互状态

- **面板拖拽**：允许用户调节面板宽高，提升可用性。
- **节点展开**：`activeNodeId` 控制哪个节点处于展开状态，当分支切换后会重置。
- **回溯反馈**：根据 `workflowRestoreState` 显示“回溯中…”、“恢复失败”等提示。

## 3. 与其它模块的接口

- `workflowNodes`: 来自 `buildWorkflowNodesFromTaskEvents`。每次上下文更新后，WorkflowPanel 重新计算树/时间线。
- `onRestoreNode`: 由 `ExtensionStateContext` 提供，最终调用 `requestWorkflowNodeRestore`。
- `workflowBranches` / `activeBranchId`: 同样来自 context，是树视图和分支列表的基础数据。
- `taskEvents` → `workflowNodes`: 通过 `useMemo` 链接在组件顶部完成。

## 4. 面试讲法建议

- 可以强调你在这个组件里兼顾了视觉和交互：分支列表 + 树 + 时间线 + Agent 状态等多个视图切换，还支持 panel 拖拽、hover 效果。
- 说明“点击回溯→请求→结果→新分支”这一完整闭环如何在 UI 里实现，体现你对上下游（context、扩展）的熟悉。
- 可展示 Demo：切换分支、查看树、点击节点回溯等，是最能让面试官直观感受的部分。

总之，`WorkflowPanel.tsx` 是 Workflow 系统的 UI 门面，实现了双视图（时间线/树）、Agent 状态追踪和回溯交互，是我们项目里最直接可见的成果。 
