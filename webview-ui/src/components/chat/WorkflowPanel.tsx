import { useEffect, useMemo, useState, useRef, useCallback, memo } from "react"
import type { PointerEvent as ReactPointerEvent } from "react"
import type { ClineMessage } from "@roo-code/types"
import { StandardTooltip } from "../ui"
import { Minus, Square, X } from "lucide-react"
import { buildChatEventTrace, type ChatEventType, type ChatTraceEvent } from "./ChatEventTrace"
import { cn } from "@/lib/utils"
import {
	buildWorkflowNodesFromTaskEvents,
	type WorkflowGraphNode,
	type WorkflowBranchMetadata,
} from "@/utils/taskEventGraph"
import { buildEnhancedWorkflowEvents } from "@/utils/workflowNodeEvents"
import type { ReceivedTaskEvent } from "@/types/taskEvents"
import type { WorkflowNodeRestorePayload } from "@roo/WebviewMessage"
import type {
	WorkflowRestoreStateSnapshot,
	WorkflowBranchInfo,
	WorkflowNodeAnalysisState,
} from "@/context/ExtensionStateContext"
import type {
	WorkflowNodeAnalysisRequestPayload,
	EnhancedWorkflowEventsData,
} from "../../../../src/shared/workflowAnalysis"

interface AgentStateSummary {
	statusLabel: string
	mode?: string
	taskLabel?: string
	messageCount: number
	lastEvent?: string
	lastUpdated?: string
}

interface WorkflowPanelProps {
	messages: ClineMessage[]
	taskEvents: ReceivedTaskEvent[]
	workflowBranches: WorkflowBranchInfo[]
	activeBranchId: string
	collapsed: boolean
	onToggleCollapse: () => void
	onClose: () => void
	agentState: AgentStateSummary
	currentCheckpoint?: string
	workflowRestoreState: WorkflowRestoreStateSnapshot
	onRestoreNode: (payload: WorkflowNodeRestorePayload, metadata?: { branchId?: string }) => void
	workflowNodeAnalyses: Record<string, WorkflowNodeAnalysisState>
	onRequestNodeAnalysis: (payload: WorkflowNodeAnalysisRequestPayload) => void
}

const tabs = [
	{ key: "workflow", label: "Workflow" },
	{ key: "state", label: "Agent State" },
	{ key: "events", label: "Agent Events" },
] as const

type TabKey = (typeof tabs)[number]["key"]
type NodeEventViewMode = "default" | "enhanced" | "analysis"
const ALL_BRANCHES_ID = "__all__"
const TREE_NODE_WIDTH = 160
const TREE_NODE_HEIGHT = 72
const TREE_HORIZONTAL_GAP = 180
const TREE_VERTICAL_GAP = 140
const TREE_PADDING_X = 100
const TREE_CONNECTOR_COLOR = "color-mix(in srgb, var(--vscode-textLink-foreground) 70%, var(--vscode-editor-background))"
const TREE_PADDING_Y = 32

export function WorkflowPanel({
	messages,
	taskEvents,
	workflowBranches,
	activeBranchId,
	collapsed,
	onToggleCollapse,
	onClose,
	agentState,
	currentCheckpoint,
	workflowRestoreState,
	onRestoreNode,
	workflowNodeAnalyses,
	onRequestNodeAnalysis,
}: WorkflowPanelProps) {
	const messageEvents = useMemo(() => buildChatEventTrace(messages), [messages])
	const branchMetadata = useMemo<Record<string, WorkflowBranchMetadata>>(() => {
		return workflowBranches.reduce<Record<string, WorkflowBranchMetadata>>((acc, branch) => {
			acc[branch.id] = {
				id: branch.id,
				label: branch.label,
				parentSnapshotId: branch.parentSnapshotId,
				parentBranchId: branch.parentBranchId,
				createdAt: branch.createdAt,
			}
			return acc
		}, {})
	}, [workflowBranches])
	const workflowNodes = useMemo<WorkflowGraphNode[]>(
		() => buildWorkflowNodesFromTaskEvents(taskEvents, { branchMetadata }),
		[taskEvents, branchMetadata],
	)
	const eventList = useMemo(() => messageEvents, [messageEvents])
	const [agentStateHistory, setAgentStateHistory] = useState<AgentStateSummary[]>([])
	const [activeNodeId, setActiveNodeId] = useState<string | null>(null)
	const [selectedBranchId, setSelectedBranchId] = useState<string>(activeBranchId)
	const [nodeEventViewModes, setNodeEventViewModes] = useState<Record<string, NodeEventViewMode>>({})
	useEffect(() => {
		setSelectedBranchId((prev) => (prev === ALL_BRANCHES_ID ? prev : activeBranchId))
	}, [activeBranchId])
	const nodesByBranch = useMemo(() => {
		const map = new Map<string, WorkflowGraphNode[]>()
		for (const node of workflowNodes) {
			const existing = map.get(node.branchId)
			if (existing) {
				existing.push(node)
			} else {
				map.set(node.branchId, [node])
			}
		}
		return map
	}, [workflowNodes])
	const visibleNodes = useMemo(() => {
		if (!selectedBranchId || selectedBranchId === ALL_BRANCHES_ID) {
			return workflowNodes
		}
		return workflowNodes.filter((node) => node.branchId === selectedBranchId)
	}, [workflowNodes, selectedBranchId])
	const branchMap = useMemo(() => new Map(workflowBranches.map((branch) => [branch.id, branch])), [workflowBranches])
	const treeLayout = useMemo(() => {
		if (workflowNodes.length === 0) {
			return null
		}
		const nodeOrder = new Map<string, number>()
		const nodesById = new Map<string, WorkflowGraphNode>()
		workflowNodes.forEach((node, index) => {
			nodeOrder.set(node.id, index)
			nodesById.set(node.id, node)
		})
		const childMap = new Map<string, WorkflowGraphNode[]>()
		const roots: WorkflowGraphNode[] = []
		for (const node of workflowNodes) {
			const parentCandidates: Array<string | undefined> = []
			if (node.previousSnapshotId) {
				parentCandidates.push(node.previousSnapshotId)
			}
			if (node.branchParentSnapshotId) {
				parentCandidates.push(node.branchParentSnapshotId)
			}
			let parentId = parentCandidates.find((candidate) => candidate && nodesById.has(candidate))
			if (parentId === node.id) {
				parentId = undefined
			}
			if (parentId) {
				const list = childMap.get(parentId)
				if (list) {
					if (!list.some((child) => child.id === node.id)) {
						list.push(node)
					}
				} else {
					childMap.set(parentId, [node])
				}
			} else {
				roots.push(node)
			}
		}
		const sortByOrder = (a: WorkflowGraphNode, b: WorkflowGraphNode) =>
			(nodeOrder.get(a.id) ?? 0) - (nodeOrder.get(b.id) ?? 0)
		for (const [key, children] of childMap) {
			children.sort(sortByOrder)
			childMap.set(key, children)
		}
		const sortedRoots = roots.length > 0 ? [...roots].sort(sortByOrder) : [...workflowNodes]
		const positions = new Map<string, { x: number; depth: number }>()
		const edges: Array<{ fromId: string; toId: string }> = []
		const visiting = new Set<string>()
		let currentX = 0
		let maxDepth = 0
		let maxX = 0
		const assignPosition = (node: WorkflowGraphNode, depth: number): number => {
			if (visiting.has(node.id)) {
				return positions.get(node.id)?.x ?? currentX
			}
			visiting.add(node.id)
			const children = childMap.get(node.id) ?? []
			const childXs: number[] = []
			for (const child of children) {
				if (visiting.has(child.id)) {
					continue
				}
				edges.push({ fromId: node.id, toId: child.id })
				const childX = assignPosition(child, depth + 1)
				childXs.push(childX)
			}
			let nodeX: number
			if (childXs.length === 0) {
				nodeX = currentX
				currentX += 1
			} else {
				nodeX = (childXs[0] + childXs[childXs.length - 1]) / 2
			}
			positions.set(node.id, { x: nodeX, depth })
			if (depth > maxDepth) {
				maxDepth = depth
			}
			if (nodeX > maxX) {
				maxX = nodeX
			}
			visiting.delete(node.id)
			return nodeX
		}
		for (const root of sortedRoots) {
			if (positions.has(root.id)) {
				continue
			}
			assignPosition(root, 0)
			currentX += 1
		}
		const width = (maxX + 1) * TREE_HORIZONTAL_GAP + TREE_PADDING_X * 2
		const height = (maxDepth + 1) * TREE_VERTICAL_GAP + TREE_PADDING_Y * 2
		return { positions, edges, width, height }
	}, [workflowNodes])
	const selectedBranchLabel = useMemo(() => {
		if (selectedBranchId === ALL_BRANCHES_ID) {
			return "全部分支"
		}
		const found = workflowBranches.find((branch) => branch.id === selectedBranchId)
		return found?.label ?? "-"
	}, [workflowBranches, selectedBranchId])
	const branchDepthMap = useMemo(() => {
		const depthMap: Record<string, number> = {}
		const depthBranchMap = new Map(workflowBranches.map((branch) => [branch.id, branch]))
		const computeDepth = (branchId: string | null | undefined): number => {
			if (!branchId) {
				return 0
			}
			if (depthMap[branchId] !== undefined) {
				return depthMap[branchId]
			}
			const branch = depthBranchMap.get(branchId)
			if (!branch) {
				return 0
			}
			const depth = computeDepth(branch.parentBranchId) + 1
			depthMap[branchId] = depth
			return depth
		}
		workflowBranches.forEach((branch) => computeDepth(branch.id))
		return depthMap
	}, [workflowBranches])
	const DEFAULT_WIDTH = Math.round(420 * 1.3)
	const DEFAULT_HEIGHT = Math.round(420 * 1.3)
	const [panelSize, setPanelSize] = useState({ width: DEFAULT_WIDTH, height: DEFAULT_HEIGHT })
	const resizeState = useRef<{
		startX: number
		startY: number
		startWidth: number
		startHeight: number
		mode: "horizontal" | "vertical" | "both"
	} | null>(null)
	useEffect(() => {
		setAgentStateHistory((prev) => {
			const next = [...prev]
			const last = next.at(-1)
			if (
				!last ||
				last.lastUpdated !== agentState.lastUpdated ||
				last.statusLabel !== agentState.statusLabel ||
				last.mode !== agentState.mode
			) {
				next.push({ ...agentState })
			}
			return next.slice(-100)
		})
	}, [agentState])
	useEffect(() => {
		if (!activeNodeId) return
		if (!visibleNodes.some((node) => node.id === activeNodeId)) {
			setActiveNodeId(null)
		}
	}, [visibleNodes, activeNodeId])
	const [activeTab, setActiveTab] = useState<TabKey>("workflow")

	if (collapsed) {
		return (
			<div className="fixed bottom-28 right-4 z-40 text-sm">
				<div className="flex items-center gap-2 rounded-xl border border-vscode-panel-border bg-[color-mix(in_srgb,var(--vscode-editor-background)_90%,var(--vscode-editorGroup-border))] px-3 py-2 shadow-lg">
					<span className="font-medium text-vscode-editor-foreground">Workflow panel</span>
					<div className="ml-auto flex gap-1">
						<StandardTooltip content="Expand">
							<button className={iconButtonClass} onClick={onToggleCollapse}>
								<Square className="h-3.5 w-3.5" />
							</button>
						</StandardTooltip>
						<StandardTooltip content="Close">
							<button className={iconButtonClass} onClick={onClose}>
								<X className="h-3.5 w-3.5" />
							</button>
						</StandardTooltip>
					</div>
				</div>
			</div>
		)
	}

	const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max)

	const updateSize = useCallback((event: PointerEvent) => {
		const state = resizeState.current
		if (!state) return
		const deltaX = event.clientX - state.startX
		const deltaY = event.clientY - state.startY
		const viewportWidth = typeof window !== "undefined" ? window.innerWidth : 1024
		const viewportHeight = typeof window !== "undefined" ? window.innerHeight : 768
		setPanelSize((prev) => {
			const nextWidth =
				state.mode === "vertical"
					? prev.width
					: clamp(state.startWidth + deltaX, 320, Math.min(viewportWidth - 48, 960))
			const nextHeight =
				state.mode === "horizontal"
					? prev.height
					: clamp(state.startHeight + deltaY, 260, Math.min(viewportHeight - 120, viewportHeight * 0.9))
			return { width: nextWidth, height: nextHeight }
		})
	}, [])

	const stopResize = useCallback(() => {
		resizeState.current = null
		window.removeEventListener("pointermove", updateSize)
		window.removeEventListener("pointerup", stopResize)
	}, [updateSize])

	const startResize = (mode: "horizontal" | "vertical" | "both") => (event: ReactPointerEvent<HTMLDivElement>) => {
		event.preventDefault()
		event.stopPropagation()
		resizeState.current = {
			startX: event.clientX,
			startY: event.clientY,
			startWidth: panelSize.width,
			startHeight: panelSize.height,
			mode,
		}
		window.addEventListener("pointermove", updateSize)
		window.addEventListener("pointerup", stopResize)
	}

	useEffect(() => () => stopResize(), [stopResize])

	const handleTreeNodeSelect = useCallback((node: WorkflowGraphNode) => {
		setSelectedBranchId(node.branchId)
		setActiveNodeId(node.id)
	}, [])

	const renderWorkflowNode = useCallback(
		(node: WorkflowGraphNode, idx: number, total: number) => {
			const eventViewMode = nodeEventViewModes[node.id] ?? "default"
			const analysisState = workflowNodeAnalyses[node.id]
			const ensureAnalysisRequested = () => {
				if (analysisState?.status === "pending" || analysisState?.status === "success") {
					return
				}
				onRequestNodeAnalysis(createWorkflowAnalysisPayload(node))
			}
			const updateNodeEventMode = (mode: NodeEventViewMode) => {
				setNodeEventViewModes((prev) => {
					const current = prev[node.id] ?? "default"
					if (current === mode) {
						return prev
					}
					if (mode === "default") {
						if (!(node.id in prev)) {
							return prev
						}
						const next = { ...prev }
						delete next[node.id]
						return next
					}
					return { ...prev, [node.id]: mode }
				})
				if (mode === "analysis") {
					ensureAnalysisRequested()
				}
			}
			const requestFreshAnalysis = () => {
				onRequestNodeAnalysis(createWorkflowAnalysisPayload(node))
			}
			const stroke = getNodeColor(node)
			const duration = node.startedAt && node.completedAt ? node.completedAt - node.startedAt : undefined
			const isActive = activeNodeId === node.id
			const displayIndex = node.stepIndex ?? idx + 1
			const nodeTitle = node.label || node.taskId
			const canRestore = Boolean(node.supportsCheckpointRestore && node.checkpoint)
			const isPendingRestore = workflowRestoreState.pendingSnapshotId === node.id
			const recentRestore = workflowRestoreState.lastCompletedSnapshotId === node.id
			const nodeError = workflowRestoreState.lastError?.snapshotId === node.id ? workflowRestoreState.lastError : null
			const isCurrentCheckpoint = Boolean(node.checkpoint?.hash && currentCheckpoint && node.checkpoint.hash === currentCheckpoint)
			const snapshotTs = node.snapshotTs ?? node.completedAt ?? node.startedAt ?? Date.now()
			const branchInfo = branchMap.get(node.branchId)
			const handleWorkflowRestore = () => {
				if (!canRestore || !node.checkpoint) {
					return
				}
				onRestoreNode(
					{
						snapshotId: node.id,
						taskId: node.taskId,
						snapshotTs,
						checkpointHash: node.checkpoint.hash,
						checkpointTs: node.checkpoint.ts ?? snapshotTs,
						strategy: "checkpoint-only",
					},
					{ branchId: node.branchId },
				)
			}
			const containerClass = "relative mb-4 last:mb-0"
			const buttonClass = cn(
				"ml-6 w-[88%] cursor-pointer rounded-xl border px-3 py-2 text-left",
				isActive
					? "border-[var(--vscode-focusBorder)] bg-[color-mix(in_srgb,var(--vscode-editor-background)_95%,var(--vscode-panel-border))]"
					: node.supportsCheckpointRestore
						? "border-[var(--vscode-charts-orange)] bg-[color-mix(in_srgb,var(--vscode-editor-background)_96%,var(--vscode-charts-orange)_15%)]"
						: "border-[var(--vscode-textLink-foreground)]",
			)
			const detailWrapperClass = "ml-6 mt-2 w-[88%] rounded-xl border border-vscode-panel-border bg-[color-mix(in_srgb,var(--vscode-editor-background)_96%,var(--vscode-panel-border))] p-3 text-xs"
			return (
				<div key={node.id} className={containerClass}>
					<svg className="absolute left-0 top-0" width="16" height="100%">
						<circle cx="8" cy="16" r="4" fill="var(--vscode-editor-background)" stroke={stroke} strokeWidth="1" />
						{idx < total - 1 && (
								<line
									x1="8"
									x2="8"
									y1="16"
									y2="100%"
									stroke={stroke}
									strokeWidth="1"
									strokeDasharray="4 4"
								/>
							)}
					</svg>
					<button type="button" onClick={() => setActiveNodeId(isActive ? null : node.id)} className={buttonClass}>
						<p className="text-[10px] uppercase tracking-widest text-vscode-descriptionForeground">Branch · {branchInfo?.label ?? node.branchId}</p>
						<div className="flex items-center gap-2">
							<p className="text-sm font-medium text-vscode-editor-foreground">
								{displayIndex}. {nodeTitle}
							</p>
							{node.supportsCheckpointRestore && (
								<span className="rounded-full border border-[var(--vscode-charts-orange)] px-2 py-px text-[10px] uppercase text-[var(--vscode-charts-orange)]">
									Checkpoint
								</span>
							)}
						</div>
						<p className="text-[11px] text-vscode-descriptionForeground">任务 ID：{node.taskId}</p>
						{node.mode && <p className="text-[11px] text-vscode-descriptionForeground">模式 {node.mode}</p>}
						{node.branchParentSnapshotId && (
							<p className="text-[11px] text-vscode-descriptionForeground">来源节点：{node.branchParentSnapshotId}</p>
						)}
						{duration !== undefined && (
							<p className="text-[11px] text-vscode-descriptionForeground">持续 {formatDuration(duration)}</p>
						)}
					</button>
					{isActive && (
						<div className={detailWrapperClass}>
							{canRestore && (
								<div className="mb-3 flex flex-wrap items-center gap-2">
									<button
										type="button"
										onClick={handleWorkflowRestore}
										disabled={isPendingRestore}
										className={cn(
											"rounded-xl border px-3 py-1 text-[11px] font-medium",
											isPendingRestore
												? "border-[var(--vscode-descriptionForeground)] text-vscode-descriptionForeground"
												: "border-[var(--vscode-charts-orange)] text-[var(--vscode-charts-orange)] hover:bg-[color-mix(in_srgb,var(--vscode-editor-background)_92%,var(--vscode-charts-orange)_25%)]",
										)}>
										{isPendingRestore ? "回溯中..." : "回溯到 checkpoint"}
									</button>
									{isCurrentCheckpoint && <span className="text-[11px] text-vscode-descriptionForeground">当前 checkpoint</span>}
								</div>
							)}
							{nodeError && (
								<p className="mb-2 text-[11px] text-[var(--vscode-errorForeground)]">恢复失败：{nodeError.message}</p>
							)}
							{!nodeError && recentRestore && (
								<p className="mb-2 text-[11px] text-[var(--vscode-charts-green)]">已回溯到该节点</p>
							)}
							<div className="mt-3">
								<div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-xs text-vscode-descriptionForeground">
									<p>{eventViewMode === "enhanced" ? "内部事件（增强版）" : "内部事件"}</p>
									<div className="inline-flex overflow-hidden rounded-full border border-vscode-panel-border">
										{(["default", "enhanced", "analysis"] as NodeEventViewMode[]).map((mode) => (
											<button
												key={mode}
												type="button"
												onClick={() => updateNodeEventMode(mode)}
												className={cn(
													"px-2 py-0.5 text-[11px] border border-transparent transition-colors hover:border-[var(--vscode-focusBorder)]",
													eventViewMode === mode
														? "bg-[color-mix(in_srgb,var(--vscode-editor-background)_90%,var(--vscode-focusBorder)_20%)] text-vscode-editor-foreground"
														: "bg-transparent text-vscode-descriptionForeground",
												)}>
												{mode === "default" ? "默认" : mode === "enhanced" ? "增强版" : "智能分析"}
											</button>
										))}
									</div>
								</div>

								<div className={eventViewMode === "default" ? "block" : "hidden"}>
									<DefaultNodeEvents events={node.events} />
								</div>
								<div className={eventViewMode === "enhanced" ? "block" : "hidden"}>
									<EnhancedNodeEvents node={node} />
								</div>
								<div className={eventViewMode === "analysis" ? "block" : "hidden"}>
									<NodeAnalysisView
										state={analysisState}
										onGenerate={ensureAnalysisRequested}
										onRefresh={requestFreshAnalysis}
									/>
								</div>
							</div>
						</div>
					)}
				</div>
			)
	}, [
		activeNodeId,
		branchMap,
		currentCheckpoint,
		nodeEventViewModes,
		onRestoreNode,
		workflowRestoreState,
		workflowNodeAnalyses,
		onRequestNodeAnalysis,
	])

	return (
		<div className="fixed bottom-28 right-4 z-40 text-sm">
			<div
				className="relative rounded-2xl border border-vscode-panel-border bg-[var(--vscode-editor-background)] shadow-2xl"
				style={{
					width: panelSize.width,
					height: panelSize.height,
					maxHeight: "75vh",
					padding: "0.85rem",
					overflow: "auto",
				}}>
				<header className="mb-4 space-y-3">
					<div className="flex items-start gap-2">
						<div>
							<p className="text-base font-semibold text-vscode-editor-foreground">动态工作流面板</p>
							<p className="text-xs text-vscode-descriptionForeground">切换上方菜单查看不同板块。</p>
						</div>
						<div className="ml-auto flex gap-1">
							<StandardTooltip content="Fold">
								<button className={iconButtonClass} onClick={onToggleCollapse}>
									<Minus className="h-3.5 w-3.5" />
								</button>
							</StandardTooltip>
							<StandardTooltip content="Close">
								<button className={iconButtonClass} onClick={onClose}>
									<X className="h-3.5 w-3.5" />
								</button>
							</StandardTooltip>
						</div>
					</div>
					<nav className="flex gap-2">
						{tabs.map((tab) => (
							<button
								key={tab.key}
								onClick={() => setActiveTab(tab.key)}
								className={cn(
									"rounded-full border px-3 py-1 text-xs font-medium",
									activeTab === tab.key
										? "border-vscode-focusBorder text-vscode-editor-foreground"
										: "border-transparent bg-[color-mix(in_srgb,var(--vscode-editor-background)_90%,var(--vscode-editorGroup-border))] text-vscode-descriptionForeground",
								)}>
								{tab.label}
							</button>
						))}
					</nav>
				</header>

				{activeTab === "workflow" && (
					<section className="space-y-3">
						<div className="rounded-xl border border-vscode-panel-border bg-[color-mix(in_srgb,var(--vscode-editor-background)_94%,var(--vscode-panel-border))] p-3">
							<div className="flex items-center justify-between text-xs text-vscode-descriptionForeground">
								<p>Branches</p>
								<span>{workflowBranches.length} 个</span>
							</div>
							<div className="mt-2 space-y-2">
								<button
									key="all-branches"
									type="button"
									onClick={() => setSelectedBranchId(ALL_BRANCHES_ID)}
									className={cn(
										"flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left",
										selectedBranchId === ALL_BRANCHES_ID
											? "border-[var(--vscode-focusBorder)] bg-[color-mix(in_srgb,var(--vscode-editor-background)_92%,var(--vscode-focusBorder)_20%)]"
											: "border-transparent bg-[color-mix(in_srgb,var(--vscode-editor-background)_98%,var(--vscode-panel-border))] hover:border-[var(--vscode-panel-border)]",
									)}>
									<div>
										<p className="text-sm font-medium text-vscode-editor-foreground">全部分支</p>
										<p className="text-[11px] text-vscode-descriptionForeground">显示所有分支树</p>
									</div>
									<div className="text-right text-[11px]">
										<p className="text-vscode-descriptionForeground">{workflowNodes.length} nodes</p>
									</div>
								</button>
								{workflowBranches.length === 0 && (
									<p className="text-xs text-vscode-descriptionForeground">暂无分支</p>
								)}
								{workflowBranches.map((branch) => {
									const depth = branchDepthMap[branch.id] ?? 0
									const isSelected = selectedBranchId === branch.id
									const nodeCount = nodesByBranch.get(branch.id)?.length ?? 0
									const isRuntimeActive = branch.id === activeBranchId
									const depthClasses = ["pl-0", "pl-4", "pl-8", "pl-12", "pl-16"]
									const paddingClass = depthClasses[Math.min(depthClasses.length - 1, depth)]
									return (
										<button
											key={branch.id}
											type="button"
											onClick={() => setSelectedBranchId(branch.id)}
											className={cn(
												"flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left",
												paddingClass,
												isSelected
													? "border-[var(--vscode-focusBorder)] bg-[color-mix(in_srgb,var(--vscode-editor-background)_92%,var(--vscode-focusBorder)_20%)]"
													: "border-transparent bg-[color-mix(in_srgb,var(--vscode-editor-background)_98%,var(--vscode-panel-border))] hover:border-[var(--vscode-panel-border)]",
											)}>
											<div>
												<p className="text-sm font-medium text-vscode-editor-foreground">{branch.label}</p>
												<p className="text-[11px] text-vscode-descriptionForeground">来源 {branch.parentSnapshotId ?? "初始"}</p>
											</div>
											<div className="text-right text-[11px]">
												<p className="text-vscode-descriptionForeground">{nodeCount} nodes</p>
												<p className={cn(isRuntimeActive ? "text-[var(--vscode-charts-green)]" : "text-vscode-descriptionForeground")}>{isRuntimeActive ? "当前运行" : branch.status === "archived" ? "历史" : "--"}</p>
											</div>
										</button>
									)
								})}
							</div>
						</div>
						<div className="flex items-center justify-between text-xs text-vscode-descriptionForeground">
							<p>Workflow 节点</p>
							<span>{visibleNodes.length} nodes · {selectedBranchLabel}</span>
						</div>
						{selectedBranchId === ALL_BRANCHES_ID ? (
							<div className="rounded-xl border border-vscode-panel-border bg-[color-mix(in_srgb,var(--vscode-editor-background)_96%,var(--vscode-panel-border))]">
								{workflowBranches.length === 0 && (
									<p className="p-4 text-xs text-vscode-descriptionForeground">暂无分支</p>
								)}
								{workflowBranches.length > 0 && (!treeLayout || workflowNodes.length === 0) && (
									<p className="p-4 text-xs text-vscode-descriptionForeground">暂无 checkpoint 数据</p>
								)}
								{treeLayout && workflowNodes.length > 0 && (() => {
									const layout = treeLayout
									if (!layout) {
										return null
									}
									return (
										<div className="relative max-h-[520px] min-h-[320px] overflow-auto">
											<div className="relative" style={{ width: layout.width, height: layout.height }}>
												<svg className="pointer-events-none absolute left-0 top-0 h-full w-full">
													{layout.edges.map((edge, idx) => {
													const fromPos = layout.positions.get(edge.fromId)
													const toPos = layout.positions.get(edge.toId)
													if (!fromPos || !toPos) {
														return null
													}
													const fromX = TREE_PADDING_X + fromPos.x * TREE_HORIZONTAL_GAP
													const fromY = TREE_PADDING_Y + fromPos.depth * TREE_VERTICAL_GAP + TREE_NODE_HEIGHT / 2
													const toX = TREE_PADDING_X + toPos.x * TREE_HORIZONTAL_GAP
													const toY = TREE_PADDING_Y + toPos.depth * TREE_VERTICAL_GAP - TREE_NODE_HEIGHT / 2
													const elbowY = (fromY + toY) / 2
													return (
														<path
															key={`${edge.fromId}-${edge.toId}-${idx}`}
															d={`M ${fromX} ${fromY} L ${fromX} ${elbowY} L ${toX} ${elbowY} L ${toX} ${toY}`}
															stroke={TREE_CONNECTOR_COLOR}
															strokeWidth={1.5}
															strokeLinecap="round"
															strokeLinejoin="round"
															fill="none"
														/>
													)
												})}
											</svg>
											{workflowNodes.map((node) => {
												const position = layout.positions.get(node.id)
												if (!position) {
													return null
												}
												const centerX = TREE_PADDING_X + position.x * TREE_HORIZONTAL_GAP
												const centerY = TREE_PADDING_Y + position.depth * TREE_VERTICAL_GAP
												const left = centerX - TREE_NODE_WIDTH / 2
												const top = centerY - TREE_NODE_HEIGHT / 2
												const branchLabel = branchMap.get(node.branchId)?.label ?? node.branchId
												return (
														<button
															key={node.id}
															type="button"
															onClick={() => handleTreeNodeSelect(node)}
															className="absolute z-10 flex flex-col rounded-2xl border border-[color-mix(in_srgb,var(--vscode-textLink-foreground)_55%,var(--vscode-panel-border))] bg-[color-mix(in_srgb,var(--vscode-editor-background)_94%,var(--vscode-panel-border))] p-3 text-left text-xs shadow-sm transition-colors hover:border-[var(--vscode-charts-orange)] hover:shadow-lg"
															style={{ left, top, width: TREE_NODE_WIDTH, height: TREE_NODE_HEIGHT }}
															aria-label={`查看 ${branchLabel} · ${node.label || node.taskId}`}>
														<p className="text-[10px] uppercase tracking-widest text-vscode-descriptionForeground leading-tight">{branchLabel}</p>
														<p className="mt-1 text-[11px] leading-tight text-vscode-descriptionForeground">
															{(() => {
																const hash = node.checkpoint?.hash ?? node.id
																if (!hash) {
																	return ""
																}
																return hash.length > 5 ? `${hash.slice(0, 5)}...` : hash
															})()}
														</p>
														<p className="mt-1 text-sm font-medium leading-tight text-vscode-editor-foreground line-clamp-2 break-words">
															{node.label || node.taskId}
														</p>
														</button>
												)
											})}
										</div>
									</div>
									)
								})()}
							</div>
						) : (
							<div className="relative pl-6">
								<div className="absolute left-1 top-0 bottom-2 w-px bg-[color-mix(in_srgb,var(--vscode-editor-background)_40%,var(--vscode-panel-border))]" />
								{visibleNodes.length === 0 && (
									<p className="text-xs text-vscode-descriptionForeground">当前分支暂无 checkpoint 数据</p>
								)}
								{visibleNodes.map((node, idx) => renderWorkflowNode(node, idx, visibleNodes.length))}
							</div>
						)}
					</section>
				)}
				{activeTab === "state" && (
					<section className="space-y-3">
						<div className="flex items-center justify-between text-xs text-vscode-descriptionForeground">
							<p>Agent 状态历史</p>
							<span>{agentStateHistory.length} 条</span>
						</div>
						<div className="space-y-3">
							{agentStateHistory.length === 0 && (
								<p className="text-xs text-vscode-descriptionForeground">暂无记录</p>
							)}
							{agentStateHistory.map((entry, idx) => (
								<div
									key={`${entry.lastUpdated}-${idx}`}
									className="rounded-xl border border-vscode-panel-border bg-[color-mix(in_srgb,var(--vscode-editor-background)_92%,var(--vscode-panel-border))] p-3 text-xs">
									<div className="flex items-center justify-between">
										<span className="font-medium text-vscode-editor-foreground">
											{entry.statusLabel}
										</span>
										<span className="text-[10px] text-vscode-descriptionForeground">
											{entry.lastUpdated || "-"}
										</span>
									</div>
									<div className="flex justify-between">
										<span className="text-vscode-descriptionForeground">模式</span>
										<span className="text-vscode-editor-foreground">{entry.mode || "-"}</span>
									</div>
									<div className="flex justify-between">
										<span className="text-vscode-descriptionForeground">任务</span>
										<span className="text-vscode-editor-foreground">{entry.taskLabel || "-"}</span>
									</div>
									<div className="flex justify-between">
										<span className="text-vscode-descriptionForeground">消息数</span>
										<span className="text-vscode-editor-foreground">{entry.messageCount}</span>
									</div>
									<div className="mt-2">
										<p className="text-vscode-descriptionForeground">事件内容</p>
										<pre className="mt-1 whitespace-pre-wrap rounded bg-[color-mix(in_srgb,var(--vscode-editor-background)_96%,var(--vscode-panel-border))] p-2 text-[11px] text-vscode-editor-foreground">
											{entry.lastEvent || "-"}
										</pre>
									</div>
								</div>
							))}
						</div>
					</section>
				)}

				{activeTab === "events" && (
					<section className="space-y-3">
						<div className="flex items-center justify-between text-xs text-vscode-descriptionForeground">
							<p>Agent 事件</p>
							<span>{eventList.length} 条</span>
						</div>
						<div className="relative pl-6">
							<div className="absolute left-1 top-0 bottom-2 w-px bg-[color-mix(in_srgb,var(--vscode-editor-background)_40%,var(--vscode-panel-border))]" />
							{eventList.length === 0 && (
								<p className="text-xs text-vscode-descriptionForeground">暂无事件</p>
							)}
							{eventList.map((event) => {
								const stroke = getEventColor(event.type)
								return (
									<div key={event.id} className="relative mb-4 last:mb-0">
										<div
											className="absolute left-1 top-3 -translate-x-1/2 rounded-full border bg-[var(--vscode-editor-background)]"
											style={{ width: 10, height: 10 }}
										/>
										<svg className="absolute left-0 top-0" width="16" height="100%">
											<circle
												cx="8"
												cy="16"
												r="4"
												fill="var(--vscode-editor-background)"
												stroke={stroke}
												strokeWidth="1"
											/>
											<line
												x1="8"
												x2="8"
												y1="16"
												y2="100%"
												stroke={stroke}
												strokeWidth="1"
												strokeDasharray="4 4"
											/>
										</svg>
										<div className="ml-4 rounded-xl border border-vscode-panel-border bg-[color-mix(in_srgb,var(--vscode-editor-background)_95%,var(--vscode-panel-border))] p-3">
											<div className="flex items-center justify-between">
												<p className="font-medium text-vscode-editor-foreground">
													{event.title}
												</p>
												<span className="text-[10px] text-vscode-descriptionForeground">
													{formatTimestamp(event.timestamp)}
												</span>
											</div>
											{event.detail && (
												<p className="text-xs text-vscode-descriptionForeground">
													{event.detail}
												</p>
											)}
											{event.sourceMessage && (
												<pre className="mt-2 max-h-60 overflow-auto rounded bg-[color-mix(in_srgb,var(--vscode-editor-background)_96%,var(--vscode-panel-border))] p-2 text-[11px] text-vscode-editor-foreground">
													{JSON.stringify(event.sourceMessage, null, 2)}
												</pre>
											)}
										</div>
									</div>
								)
							})}
						</div>
					</section>
				)}
				<div className="pointer-events-auto select-none">
					<div
						className="absolute inset-y-2 right-0 w-2 cursor-ew-resize"
						onPointerDown={startResize("horizontal")}
					/>
					<div
						className="absolute bottom-0 left-2 right-2 h-2 cursor-ns-resize"
						onPointerDown={startResize("vertical")}
					/>
					<div
						className="absolute bottom-0 right-0 h-4 w-4 cursor-nwse-resize"
						onPointerDown={startResize("both")}
					/>
				</div>
			</div>
		</div>
	)
}

const iconButtonClass = cn(
	"inline-flex h-6 w-6 items-center justify-center rounded-md border border-transparent bg-transparent text-vscode-descriptionForeground",
	"hover:text-vscode-editor-foreground hover:bg-[rgba(255,255,255,0.05)] focus-visible:outline focus-visible:outline-1 focus-visible:outline-vscode-focusBorder",
)

const MODE_COLOR_RULES: { match: RegExp; color: string }[] = [
	{ match: /triage/i, color: "var(--vscode-textLink-foreground)" },
	{ match: /builder|tool/i, color: "var(--vscode-charts-orange)" },
	{ match: /report|summary/i, color: "var(--vscode-charts-green)" },
	{ match: /review|qa/i, color: "var(--vscode-charts-red)" },
]

const EVENT_COLOR_MAP: Record<ChatEventType, string> = {
	agent: "var(--vscode-textLink-foreground)",
	tool: "var(--vscode-charts-orange)",
	subagent: "var(--vscode-charts-red)",
	hook: "var(--vscode-charts-green)",
}

function getNodeColor(node: WorkflowGraphNode): string {
	if (node.supportsCheckpointRestore) {
		return "var(--vscode-charts-orange)"
	}
	if (node.mode) {
		for (const rule of MODE_COLOR_RULES) {
			if (rule.match.test(node.mode)) {
				return rule.color
			}
		}
	}
	return "var(--vscode-textLink-foreground)"
}

function getEventColor(type: ChatEventType): string {
	return EVENT_COLOR_MAP[type] ?? "var(--vscode-panel-border)"
}

function formatDuration(ms: number) {
	if (ms < 1000) {
		return `${ms}ms`
	}
	const seconds = ms / 1000
	if (seconds < 60) {
		return `${seconds.toFixed(1)}s`
	}
	const minutes = Math.floor(seconds / 60)
	const rest = Math.round(seconds % 60)
	return `${minutes}m ${rest}s`
}

function formatTimestamp(ts?: number) {
	if (!ts) return "-"
	const date = new Date(ts)
	return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })
}

function DefaultNodeEvents({ events }: { events: ChatTraceEvent[] }) {
	if (events.length === 0) {
		return <p className="text-vscode-descriptionForeground">无工具/Hook 活动</p>
	}

	return (
		<>
			{events.map((event) => (
				<div key={event.id} className="mb-2 last:mb-0">
					<div className="flex items-center justify之间">
						<p className="font-medium text-vscode-editor-foreground">{event.title}</p>
						<span className="text-[10px] text-vscode-descriptionForeground">{formatTimestamp(event.timestamp)}</span>
					</div>
					{event.detail && <p className="text-vscode-descriptionForeground">{event.detail}</p>}
					{event.sourceMessage && (
						<pre className="mt-1 max-h-40 overflow-auto rounded bg-[color-mix(in_srgb,var(--vscode-editor-background)_98%,var(--vscode-panel-border))] p-2 text-[11px] text-vscode-editor-foreground">
							{JSON.stringify(event.sourceMessage, null, 2)}
						</pre>
					)}
				</div>
			))}
		</>
	)
}

function EnhancedNodeEvents({ node }: { node: WorkflowGraphNode }) {
	const data = useMemo(() => buildEnhancedWorkflowEvents(node), [node])
	const stats = data.stats
	const resolvedTools = stats.toolSuccessCount + stats.toolFailureCount
	const totalToolRuns = Math.max(stats.toolCount, resolvedTools)
	const pendingTools = Math.max(totalToolRuns - resolvedTools, 0)
	const toolSuccessDisplay = totalToolRuns > 0 ? `${stats.toolSuccessCount} / ${totalToolRuns}` : "0"
	const toolFailureDisplay = totalToolRuns > 0 ? `${stats.toolFailureCount} / ${totalToolRuns}` : "0"
	const shouldShowUserSection = data.userEvents.length > 0 || Boolean(node.userMessage)

	return (
		<div className="space-y-4 text-[11px]">
				<div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
					<EnhancedStat label="工具次数" value={totalToolRuns} />
					<EnhancedStat label="工具成功" value={toolSuccessDisplay} />
					<EnhancedStat label="工具失败" value={toolFailureDisplay} />
					{pendingTools > 0 && <EnhancedStat label="工具待定" value={pendingTools} />}
					<EnhancedStat label="Hook 次数" value={stats.hookCount} />
					<EnhancedStat label="子任务" value={stats.subagentCount} />
					<EnhancedStat label="Agent 事件" value={stats.agentCount} />
					<EnhancedStat label="Token 输入" value={stats.totalTokensIn} />
					<EnhancedStat label="Token 输出" value={stats.totalTokensOut} />
					{typeof stats.durationMs === "number" && <EnhancedStat label="持续时间" value={formatDuration(stats.durationMs)} />}
				</div>

			{data.toolEvents.length > 0 && (
				<section>
					<p className="mb-1 text-xs font-semibold text-vscode-descriptionForeground">工具事件</p>
					<div className="space-y-2">
						{data.toolEvents.map((event) => (
							<div key={event.id} className="rounded-lg border border-vscode-panel-border bg-[color-mix(in_srgb,var(--vscode-editor-background)_98%,var(--vscode-panel-border))] p-3">
								<div className="mb-1 flex items-center justify-between text-[10px] uppercase tracking-widest text-vscode-descriptionForeground">
									<span>{event.status ?? "TOOL"}</span>
									<div className="flex items-center gap-2">
										{event.outcome && (
											<span
												className={cn(
													"rounded-full px-2 py-0.5 text-[10px] font-semibold",
													event.outcome === "success"
														? "bg-[color-mix(in_srgb,var(--vscode-charts-green)_20%,var(--vscode-editor-background)_80%)] text-[var(--vscode-charts-green)]"
														: "bg-[color-mix(in_srgb,var(--vscode-charts-red)_20%,var(--vscode-editor-background)_80%)] text-[var(--vscode-charts-red)]",
													)}>
													{event.outcome === "success" ? "成功" : "失败"}
											</span>
										)}
										{event.timestamp && <span>{formatTimestamp(event.timestamp)}</span>}
									</div>
								</div>
								<p className="text-sm font-medium text-vscode-editor-foreground">{event.name ?? event.action ?? "Tool event"}</p>
								{event.detail && <p className="text-[11px] text-vscode-descriptionForeground">{event.detail}</p>}
								{(event.tokensIn || event.tokensOut) && (
									<p className="mt-1 text-[10px] text-vscode-descriptionForeground">Token 输入 {event.tokensIn ?? 0} / 输出 {event.tokensOut ?? 0}</p>
								)}
							</div>
						))}
					</div>
				</section>
			)}

			{data.hookEvents.length > 0 && (
				<section>
					<p className="mb-1 text-xs font-semibold text-vscode-descriptionForeground">Hook 事件</p>
					<div className="space-y-2">
						{data.hookEvents.map((event) => (
							<div key={event.id} className="rounded-lg border border-vscode-panel-border bg-[color-mix(in_srgb,var(--vscode-editor-background)_98%,var(--vscode-panel-border))] p-3">
								<div className="mb-1 flex items-center justify-between text-[10px] uppercase tracking-widest text-vscode-descriptionForeground">
									<span>{event.status ?? "HOOK"}</span>
									{event.timestamp && <span>{formatTimestamp(event.timestamp)}</span>}
								</div>
								<p className="text-sm font-medium text-vscode-editor-foreground">{event.name}</p>
								{event.detail && <p className="text-[11px] text-vscode-descriptionForeground">{event.detail}</p>}
								{(event.tokensIn || event.tokensOut) && (
									<p className="mt-1 text-[10px] text-vscode-descriptionForeground">Token 输入 {event.tokensIn ?? 0} / 输出 {event.tokensOut ?? 0}</p>
								)}
							</div>
						))}
					</div>
				</section>
			)}

			{shouldShowUserSection && (
				<section>
					<p className="mb-1 text-xs font-semibold text-vscode-descriptionForeground">用户输入</p>
					<div className="space-y-2">
						{data.userEvents.length > 0 ? (
							data.userEvents.map((event) => (
								<div
									key={event.id}
									className="rounded-lg border border-vscode-panel-border/80 bg-[color-mix(in_srgb,var(--vscode-editor-background)_98%,var(--vscode-panel-border))] p-3">
									<div className="mb-1 flex items-center justify-between text-[10px] text-vscode-descriptionForeground">
										<span>{event.label}</span>
										{event.timestamp && <span>{formatTimestamp(event.timestamp)}</span>}
									</div>
									<p className="text-sm text-vscode-editor-foreground">{event.text ?? "（无用户输入文本）"}</p>
								</div>
							))
						) : (
							<div className="rounded-lg border border-dashed border-vscode-panel-border/60 bg-[color-mix(in_srgb,var(--vscode-editor-background)_96%,var(--vscode-panel-border))] p-3">
								<p className="text-[10px] uppercase tracking-widest text-vscode-descriptionForeground">用户输入</p>
								<p className="text-sm text-vscode-descriptionForeground">（暂无记录）</p>
							</div>
						)}
					</div>
				</section>
			)}

			{data.agentEvents.length > 0 && (
				<section>
					<p className="mb-1 text-xs font-semibold text-vscode-descriptionForeground">Agent 输出</p>
					<div className="space-y-2">
						{data.agentEvents.map((event) => (
							<div key={event.id} className="rounded-lg border border-vscode-panel-border/80 bg-[color-mix(in_srgb,var(--vscode-editor-background)_98%,var(--vscode-panel-border))] p-3">
								<div className="mb-1 flex items-center justify之间 text-[10px] text-vscode-descriptionForeground">
									<span>{event.label}</span>
									{event.timestamp && <span>{formatTimestamp(event.timestamp)}</span>}
								</div>
								<p className="text-sm text-vscode-editor-foreground">{event.text}</p>
							</div>
						))}
					</div>
				</section>
			)}

			{data.subagentEvents.length > 0 && (
				<section>
					<p className="mb-1 text-xs font-semibold text-vscode-descriptionForeground">Subagent</p>
					<div className="space-y-2">
						{data.subagentEvents.map((event) => (
							<div key={event.id} className="rounded-lg border border-vscode-panel-border/80 bg-[color-mix(in_srgb,var(--vscode-editor-background)_98%,var(--vscode-panel-border))] p-3">
								<div className="mb-1 flex items-center justify-between text-[10px] text-vscode-descriptionForeground">
									<span>{event.label}</span>
									{event.timestamp && <span>{formatTimestamp(event.timestamp)}</span>}
								</div>
								<p className="text-sm text-vscode-editor-foreground">{event.text}</p>
							</div>
						))}
					</div>
				</section>
			)}

			{data.isEmpty && <p className="text-vscode-descriptionForeground">暂无增强型摘要，可切换回默认视图查看原始事件。</p>}
		</div>
	)
}

function EnhancedStat({ label, value }: { label: string; value: string | number }) {
	return (
		<div className="rounded-lg border border-vscode-panel-border/80 bg-[color-mix(in_srgb,var(--vscode-editor-background)_98%,var(--vscode-panel-border))] p-2">
			<p className="text-[10px] uppercase tracking-widest text-vscode-descriptionForeground">{label}</p>
			<p className="text-sm font-semibold text-vscode-editor-foreground">{value}</p>
		</div>
	)
}

function NodeAnalysisView({
	state,
	onGenerate,
	onRefresh,
}: {
	state?: WorkflowNodeAnalysisState
	onGenerate: () => void
	onRefresh: () => void
}) {
	if (!state) {
		return (
			<div className="rounded-lg border border-dashed border-vscode-panel-border/60 bg-[color-mix(in_srgb,var(--vscode-editor-background)_96%,var(--vscode-panel-border))] p-3 text-[11px] text-vscode-descriptionForeground">
				<p className="mb-2">还没有生成诊断。</p>
				<button
					type="button"
					onClick={onGenerate}
					className="rounded border border-[var(--vscode-focusBorder)] px-3 py-1 text-[11px] text-vscode-editor-foreground hover:bg-[color-mix(in_srgb,var(--vscode-editor-background)_92%,var(--vscode-focusBorder)_15%)]">
					生成智能分析
				</button>
			</div>
		)
	}
	if (state.status === "pending") {
		return (
			<div className="space-y-2 rounded-lg border border-vscode-panel-border/80 bg-[color-mix(in_srgb,var(--vscode-editor-background)_98%,var(--vscode-panel-border))] p-3 text-[11px] text-vscode-descriptionForeground">
				<p>正在分析该节点…</p>
				{state.analysis && (
					<pre className="whitespace-pre-wrap text-[11px] text-vscode-editor-foreground">{state.analysis}</pre>
				)}
			</div>
		)
	}
	if (state.status === "error") {
		return (
			<div className="space-y-2 rounded-lg border border-[var(--vscode-errorForeground)]/40 bg-[color-mix(in_srgb,var(--vscode-editor-background)_98%,var(--vscode-errorForeground)_8%)] p-3 text-[11px] text-[var(--vscode-errorForeground)]">
				<p>生成分析失败：{state.error ?? "未知错误"}</p>
				<button
					type="button"
					onClick={onRefresh}
					className="rounded border border-[var(--vscode-errorForeground)] px-3 py-1 text-[var(--vscode-errorForeground)] hover:bg-[color-mix(in_srgb,var(--vscode-editor-background)_94%,var(--vscode-errorForeground)_18%)]">
					重试
				</button>
			</div>
		)
	}
	return (
		<div className="space-y-3 rounded-lg border border-vscode-panel-border/80 bg-[color-mix(in_srgb,var(--vscode-editor-background)_98%,var(--vscode-panel-border))] p-3">
			<div className="flex items-center justify-between text-[10px] text-vscode-descriptionForeground">
				<span>AI 诊断</span>
				{state.generatedAt && <span>{new Date(state.generatedAt).toLocaleTimeString()}</span>}
			</div>
			{state.analysis ? (
				<pre className="whitespace-pre-wrap text-[11px] text-vscode-editor-foreground">{state.analysis}</pre>
			) : (
				<p className="text-[11px] text-vscode-descriptionForeground">（模型未返回文本）</p>
			)}
			{state.suggestions && state.suggestions.length > 0 && (
				<div>
					<p className="mb-1 text-[10px] uppercase tracking-widest text-vscode-descriptionForeground">建议</p>
					<ul className="list-disc pl-4 text-[11px] text-vscode-editor-foreground">
						{state.suggestions.map((item, index) => (
							<li key={`${item}-${index}`}>{item}</li>
						))}
					</ul>
				</div>
			)}
			<div className="flex justify-end gap-2 text-[11px]">
				<button
					type="button"
					onClick={onRefresh}
					className="rounded border border-vscode-panel-border px-2 py-0.5 text-vscode-descriptionForeground hover:text-vscode-editor-foreground">
					重新分析
				</button>
			</div>
		</div>
	)
}

function createWorkflowAnalysisPayload(node: WorkflowGraphNode): WorkflowNodeAnalysisRequestPayload {
	const summary = buildEnhancedWorkflowEvents(node)
	const userMessageText = (node.userMessage as ClineMessage | undefined)?.text ?? node.userMessage?.say
	return {
		nodeId: node.id,
		taskId: node.taskId,
		branchId: node.branchId,
		label: node.label,
		mode: node.mode,
		startedAt: node.startedAt,
		completedAt: node.completedAt,
		checkpointHash: node.checkpoint?.hash,
		summary: truncateWorkflowSummary(summary),
		userMessage: typeof userMessageText === "string" ? userMessageText : undefined,
	}
}

function truncateWorkflowSummary(summary: EnhancedWorkflowEventsData): EnhancedWorkflowEventsData {
	return {
		...summary,
		toolEvents: summary.toolEvents.slice(0, 12),
		hookEvents: summary.hookEvents.slice(0, 8),
		agentEvents: summary.agentEvents.slice(0, 6),
		subagentEvents: summary.subagentEvents.slice(0, 4),
		userEvents: summary.userEvents.slice(0, 4),
	}
}
