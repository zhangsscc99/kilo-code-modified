import { useEffect, useMemo, useState } from "react"
import type { ClineMessage } from "@roo-code/types"
import { StandardTooltip } from "../ui"
import { Minus, Square, X } from "lucide-react"
import { buildChatEventTrace, type ChatTraceEvent } from "./ChatEventTrace"
import { cn } from "@/lib/utils"

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

export function WorkflowPanel({ messages, collapsed, onToggleCollapse, onClose, agentState }: WorkflowPanelProps) {
	const events = useMemo(() => buildChatEventTrace(messages), [messages])
	const workflowNodes = useMemo(() => buildWorkflowNodes(events), [events])
	const eventList = useMemo(() => events, [events])
	const [agentStateHistory, setAgentStateHistory] = useState<AgentStateSummary[]>([])
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

	return (
		<div className="fixed bottom-28 right-4 z-40 text-sm">
			<div className="max-h-[70vh] w-[420px] resize rounded-2xl border border-vscode-panel-border bg-[var(--vscode-editor-background)] shadow-2xl" style={{ padding: "0.85rem", overflow: "auto" }}>
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
						<div className="flex items-center justify之间 text-xs text-vscode-descriptionForeground">
							<p>Workflow 节点</p>
							<span>{workflowNodes.length} nodes</span>
						</div>
						<div className="relative pl-6">
							<svg className="absolute left-0 top-0" width="16" height="100%">
								<line x1="8" x2="8" y1="0" y2="100%" stroke="color-mix(in srgb, var(--vscode-editor-background) 40%, var(--vscode-panel-border))" strokeWidth="1" />
							</svg>
							{workflowNodes.length === 0 && <p className="text-xs text-vscode-descriptionForeground">暂无数据</p>}
							{workflowNodes.map((node, idx) => {
								const stroke = getColorForType(node.type)
								return (
									<div key={`${node.type}-${node.index}-${node.timestamp}`} className="relative mb-4 last:mb-0">
									<svg className="absolute left-0 top-0" width="16" height="100%">
										<circle cx="8" cy="16" r="4" fill="var(--vscode-editor-background)" stroke={stroke} strokeWidth="1" />
										{idx < workflowNodes.length - 1 && (
											<line x1="8" x2="8" y1="16" y2="100%" stroke={stroke} strokeWidth="1" strokeDasharray="4 4" />
										)}
									</svg>
									<div
										className={cn(
											"ml-6 rounded-xl border px-3 py-2",
											node.type === "agent" && "border-[var(--vscode-textLink-foreground)]",
											node.type === "tool" && "border-[var(--vscode-charts-orange)]",
											node.type === "subagent" && "border-[var(--vscode-charts-red)]",
											node.type === "hook" && "border-[var(--vscode-charts-green)]",
										)}>
										<p className="text-[10px] uppercase tracking-widest text-vscode-descriptionForeground">{node.type}</p>
										<p className="text-sm font-medium text-vscode-editor-foreground">{node.label}</p>
										<p className="text-[11px] text-vscode-descriptionForeground">持续 {node.durationLabel}</p>
									</div>
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
								const stroke = getColorForType(event.type)
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
			</div>
		</div>
	)
}

const iconButtonClass = cn(
	"inline-flex h-6 w-6 items-center justify-center rounded-md border border-transparent bg-transparent text-vscode-descriptionForeground",
	"hover:text-vscode-editor-foreground hover:bg-[rgba(255,255,255,0.05)] focus-visible:outline focus-visible:outline-1 focus-visible:outline-vscode-focusBorder",
)

function buildWorkflowNodes(events: ChatTraceEvent[]) {
	return events.map((event, index, arr) => {
		const prev = arr[index - 1]
		const duration = prev ? Math.max(event.timestamp - prev.timestamp, 0) : 0
		return {
			index,
			type: event.type,
			label: event.title.replace(/^.+·\s*/, ""),
			timestamp: event.timestamp,
			durationLabel: duration > 0 ? formatDuration(duration) : "瞬时",
		}
	})
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

function getColorForType(type: string) {
	switch (type) {
		case "agent":
			return "var(--vscode-textLink-foreground)"
		case "tool":
			return "var(--vscode-charts-orange)"
		case "subagent":
			return "var(--vscode-charts-red)"
		case "hook":
			return "var(--vscode-charts-green)"
		default:
			return "var(--vscode-panel-border)"
	}
}
