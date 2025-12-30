import { useEffect, useMemo, useState, useRef, useCallback } from "react"
import type { PointerEvent as ReactPointerEvent } from "react"
import type { ClineMessage } from "@roo-code/types"
import { StandardTooltip } from "../ui"
import { Minus, Square, X } from "lucide-react"
import { buildChatEventTrace, type ChatEventType } from "./ChatEventTrace"
import { cn } from "@/lib/utils"
import { buildWorkflowNodesFromTaskEvents, type WorkflowGraphNode } from "@/utils/taskEventGraph"
import type { ReceivedTaskEvent } from "@/types/taskEvents"

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
	collapsed: boolean
	onToggleCollapse: () => void
	onClose: () => void
	agentState: AgentStateSummary
}

const tabs = [
	{ key: "workflow", label: "Workflow" },
	{ key: "state", label: "Agent State" },
	{ key: "events", label: "Agent Events" },
] as const

type TabKey = (typeof tabs)[number]["key"]

export function WorkflowPanel({ messages, taskEvents, collapsed, onToggleCollapse, onClose, agentState }: WorkflowPanelProps) {
	const messageEvents = useMemo(() => buildChatEventTrace(messages), [messages])
	const workflowNodes = useMemo<WorkflowGraphNode[]>(
		() => buildWorkflowNodesFromTaskEvents(taskEvents),
		[taskEvents],
	)
	const eventList = useMemo(() => messageEvents, [messageEvents])
	const [agentStateHistory, setAgentStateHistory] = useState<AgentStateSummary[]>([])
	const [activeNodeId, setActiveNodeId] = useState<string | null>(null)
	const DEFAULT_WIDTH = Math.round(420 * 1.3)
	const DEFAULT_HEIGHT = Math.round(420 * 1.3)
	const [panelSize, setPanelSize] = useState({ width: DEFAULT_WIDTH, height: DEFAULT_HEIGHT })
	const resizeState = useRef<{ startX: number; startY: number; startWidth: number; startHeight: number; mode: "horizontal" | "vertical" | "both" } | null>(null)
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
		if (!workflowNodes.some((node) => node.id === activeNodeId)) {
			setActiveNodeId(null)
		}
	}, [workflowNodes, activeNodeId])
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

	const updateSize = useCallback(
		(event: PointerEvent) => {
			const state = resizeState.current
			if (!state) return
			const deltaX = event.clientX - state.startX
			const deltaY = event.clientY - state.startY
			const viewportWidth = typeof window !== "undefined" ? window.innerWidth : 1024
			const viewportHeight = typeof window !== "undefined" ? window.innerHeight : 768
			setPanelSize((prev) => {
				const nextWidth = state.mode === "vertical" ? prev.width : clamp(state.startWidth + deltaX, 320, Math.min(viewportWidth - 48, 960))
				const nextHeight = state.mode === "horizontal" ? prev.height : clamp(state.startHeight + deltaY, 260, Math.min(viewportHeight - 120, viewportHeight * 0.9))
				return { width: nextWidth, height: nextHeight }
			})
		},
		[],
	)

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

	return (
		<div className="fixed bottom-28 right-4 z-40 text-sm">
			<div
				className="relative rounded-2xl border border-vscode-panel-border bg-[var(--vscode-editor-background)] shadow-2xl"
				style={{ width: panelSize.width, height: panelSize.height, maxHeight: "75vh", padding: "0.85rem", overflow: "auto" }}
			>
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
						<div className="flex items-center justify-between text-xs text-vscode-descriptionForeground">
							<p>Workflow 节点</p>
							<span>{workflowNodes.length} nodes</span>
						</div>
						<div className="relative pl-6">
							<div className="absolute left-1 top-0 bottom-2 w-px bg-[color-mix(in_srgb,var(--vscode-editor-background)_40%,var(--vscode-panel-border))]" />
							{workflowNodes.length === 0 && <p className="text-xs text-vscode-descriptionForeground">暂无数据</p>}
							{workflowNodes.map((node, idx) => {
								const stroke = getNodeColor(node)
								const duration = node.startedAt && node.completedAt ? node.completedAt - node.startedAt : undefined
								const isActive = activeNodeId === node.id
								const displayIndex = node.stepIndex ?? idx + 1
								const nodeTitle = node.label || node.taskId
								return (
									<div key={node.id} className="relative mb-4 last:mb-0">
										<svg className="absolute left-0 top-0" width="16" height="100%">
											<circle cx="8" cy="16" r="4" fill="var(--vscode-editor-background)" stroke={stroke} strokeWidth="1" />
											{idx < workflowNodes.length - 1 && (
												<line x1="8" x2="8" y1="16" y2="100%" stroke={stroke} strokeWidth="1" strokeDasharray="4 4" />
											)}
										</svg>
										<button
											type="button"
											onClick={() => setActiveNodeId(isActive ? null : node.id)}
											className={cn(
												"ml-6 w-[88%] cursor-pointer rounded-xl border px-3 py-2 text-left",
												isActive
													? "border-[var(--vscode-focusBorder)] bg-[color-mix(in_srgb,var(--vscode-editor-background)_95%,var(--vscode-panel-border))]"
													: "border-[var(--vscode-textLink-foreground)]",
											)}>
											<p className="text-[10px] uppercase tracking-widest text-vscode-descriptionForeground">Agent</p>
											<p className="text-sm font-medium text-vscode-editor-foreground">
												{displayIndex}. {nodeTitle}
											</p>
											<p className="text-[11px] text-vscode-descriptionForeground">任务 ID：{node.taskId}</p>
											{node.mode && <p className="text-[11px] text-vscode-descriptionForeground">模式 {node.mode}</p>}
											{duration !== undefined && (
												<p className="text-[11px] text-vscode-descriptionForeground">持续 {formatDuration(duration)}</p>
											)}
										</button>
										{isActive && (
											<div className="ml-6 mt-2 w-[88%] rounded-xl border border-vscode-panel-border bg-[color-mix(in_srgb,var(--vscode-editor-background)_96%,var(--vscode-panel-border))] p-3 text-xs">
												<p className="mb-2 text-vscode-descriptionForeground">内部事件</p>
												{node.events.length === 0 && <p className="text-vscode-descriptionForeground">无工具/Hook 活动</p>}
												{node.events.map((event) => (
													<div key={event.id} className="mb-2 last:mb-0">
														<div className="flex items-center justify-between">
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
											</div>
										)}
									</div>
								)
							})}
						</div>
					</section>
				)}

				{activeTab === "state" && (
					<section className="space-y-3">
						<div className="flex items-center justify-between text-xs text-vscode-descriptionForeground">
							<p>Agent 状态历史</p>
							<span>{agentStateHistory.length} 条</span>
						</div>
						<div className="space-y-3">
							{agentStateHistory.length === 0 && <p className="text-xs text-vscode-descriptionForeground">暂无记录</p>}
							{agentStateHistory.map((entry, idx) => (
								<div key={`${entry.lastUpdated}-${idx}`} className="rounded-xl border border-vscode-panel-border bg-[color-mix(in_srgb,var(--vscode-editor-background)_92%,var(--vscode-panel-border))] p-3 text-xs">
									<div className="flex items-center justify-between">
										<span className="font-medium text-vscode-editor-foreground">{entry.statusLabel}</span>
										<span className="text-[10px] text-vscode-descriptionForeground">{entry.lastUpdated || "-"}</span>
									</div>
									<div className="flex justify-between"><span className="text-vscode-descriptionForeground">模式</span><span className="text-vscode-editor-foreground">{entry.mode || "-"}</span></div>
									<div className="flex justify-between"><span className="text-vscode-descriptionForeground">任务</span><span className="text-vscode-editor-foreground">{entry.taskLabel || "-"}</span></div>
									<div className="flex justify-between"><span className="text-vscode-descriptionForeground">消息数</span><span className="text-vscode-editor-foreground">{entry.messageCount}</span></div>
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
							{eventList.length === 0 && <p className="text-xs text-vscode-descriptionForeground">暂无事件</p>}
							{eventList.map((event) => {
								const stroke = getEventColor(event.type)
								return (
									<div key={event.id} className="relative mb-4 last:mb-0">
									<div
										className="absolute left-1 top-3 -translate-x-1/2 rounded-full border bg-[var(--vscode-editor-background)]"
										style={{ width: 10, height: 10 }}
									/>
									<svg className="absolute left-0 top-0" width="16" height="100%">
										<circle cx="8" cy="16" r="4" fill="var(--vscode-editor-background)" stroke={stroke} strokeWidth="1" />
										<line x1="8" x2="8" y1="16" y2="100%" stroke={stroke} strokeWidth="1" strokeDasharray="4 4" />
									</svg>
									<div className="ml-4 rounded-xl border border-vscode-panel-border bg-[color-mix(in_srgb,var(--vscode-editor-background)_95%,var(--vscode-panel-border))] p-3">
										<div className="flex items-center justify-between">
											<p className="font-medium text-vscode-editor-foreground">{event.title}</p>
											<span className="text-[10px] text-vscode-descriptionForeground">{formatTimestamp(event.timestamp)}</span>
										</div>
										{event.detail && <p className="text-xs text-vscode-descriptionForeground">{event.detail}</p>}
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
					<div className="absolute inset-y-2 right-0 w-2 cursor-ew-resize" onPointerDown={startResize("horizontal")} />
					<div className="absolute bottom-0 left-2 right-2 h-2 cursor-ns-resize" onPointerDown={startResize("vertical")} />
					<div className="absolute bottom-0 right-0 h-4 w-4 cursor-nwse-resize" onPointerDown={startResize("both")} />
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
