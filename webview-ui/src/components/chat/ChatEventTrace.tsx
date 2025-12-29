import { useMemo, type FC } from "react"
import type { ClineMessage } from "@roo-code/types"
import { safeJsonParse } from "@roo/safeJsonParse"

export type ChatEventType = "agent" | "tool" | "subagent" | "hook"

export interface ChatTraceEvent {
	id: string
	type: ChatEventType
	timestamp: number
	title: string
	detail?: string
	sourceMessage?: ClineMessage
}

const SUBAGENT_TOOL_NAMES = new Set([
	"new_task",
	"finish_sub_task",
	"resume_parent_task",
	"attempt_completion",
])

const TOOL_SAY_TYPES = new Set([
	"command_output",
	"browser_action",
	"browser_action_result",
	"mcp_server_response",
	"codebase_search_result",
])

const AGENT_SAY_TYPES = new Set([
	"text",
	"reasoning",
	"completion_result",
	"user_feedback",
	"user_feedback_diff",
])

const HOOK_SAY_TYPES = new Set([
	"api_req_started",
	"api_req_finished",
	"api_req_retried",
	"api_req_retry_delayed",
	"api_req_deleted",
	"checkpoint_saved",
	"condense_context",
	"condense_context_error",
	"sliding_window_truncation",
	"browser_session_status",
	"shell_integration_warning",
	"user_edit_todos",
])

const HOOK_ASK_TYPES = new Set([
	"condense",
	"condense_context",
	"resume_task",
	"resume_completed_task",
	"api_req_failed",
	"mistake_limit_reached",
	"invalid_model",
	"payment_required_prompt",
	"report_bug",
])

const AGENT_ASK_TYPES = new Set([
	"followup",
	"completion_result",
	"command_output",
	"resume_task",
	"resume_completed_task",
])

const TOOL_ASK_TYPES = new Set(["tool", "command", "browser_action_launch", "use_mcp_server"])

const EVENT_CONFIG: Record<ChatEventType, { label: string; dotClass: string; emptyLabel: string }> = {
	agent: {
		label: "Agent events",
		dotClass: "bg-[var(--vscode-charts-blue)]",
		emptyLabel: "No agent activity yet",
	},
	tool: {
		label: "Tool events",
		dotClass: "bg-[var(--vscode-charts-orange)]",
		emptyLabel: "No tool usage yet",
	},
	subagent: {
		label: "Subagent events",
		dotClass: "bg-[var(--vscode-charts-red)]",
		emptyLabel: "No subagent activity yet",
	},
	hook: {
		label: "Hook events",
		dotClass: "bg-[var(--vscode-charts-green)]",
		emptyLabel: "No hook events yet",
	},
}

interface ToolPayload {
	tool?: string
	toolName?: string
	tool_title?: string
	toolUseId?: string
	workspaceFile?: string
	path?: string
	paths?: string[]
	commandLine?: string
	command?: string
	[key: string]: unknown
}

function getToolPayload(message: ClineMessage): ToolPayload | undefined {
	if (message.ask !== "tool" || !message.text) return undefined
	const parsed = safeJsonParse<ToolPayload>(message.text, undefined)
	return parsed
}

function normalizeToolName(payload?: ToolPayload): string | undefined {
	if (!payload) return undefined
	const name = payload.tool || payload.toolName || payload.tool_title
	return typeof name === "string" ? name : undefined
}

function isSubagentTool(name?: string): boolean {
	if (!name) return false
	return SUBAGENT_TOOL_NAMES.has(name.toLowerCase()) || name.toLowerCase().includes("subtask")
}

function truncateDetail(text?: string, limit = 120): string | undefined {
	if (!text) return undefined
	const trimmed = text.trim()
	if (!trimmed) return undefined
	return trimmed.length > limit ? `${trimmed.slice(0, limit)}...` : trimmed
}

function formatRelativeTime(timestamp: number, baseTimestamp: number): string {
	const delta = Math.max(timestamp - baseTimestamp, 0)
	if (delta < 1000) {
		return "+0s"
	}
	if (delta < 60000) {
		return `+${Math.round(delta / 1000)}s`
	}
	const minutes = Math.floor(delta / 60000)
	const seconds = Math.round((delta % 60000) / 1000)
	return `+${minutes}m ${seconds}s`
}

function buildEventFromMessage(message: ClineMessage, index: number): ChatTraceEvent | null {
	if (!message || typeof message.ts !== "number") return null
	if (index === 0) return null

	const baseEvent: Omit<ChatTraceEvent, "type"> = {
		id: `${message.ts}-${message.type}-${index}`,
		timestamp: message.ts,
		title: "",
		detail: undefined,
	}

	const toolPayload = getToolPayload(message)
	const toolName = normalizeToolName(toolPayload)

	if (message.say === "subtask_result" || isSubagentTool(toolName)) {
		return {
			...baseEvent,
			type: "subagent",
			title: toolName ? `Subtask · ${toolName}` : "Subtask event",
			detail: truncateDetail(message.text || (toolPayload?.message as string | undefined)),
			sourceMessage: message,
		}
	}

	if (TOOL_ASK_TYPES.has(message.ask || "") || TOOL_SAY_TYPES.has(message.say || "")) {
		const detail =
			toolPayload?.path ||
			toolPayload?.workspaceFile ||
			toolPayload?.paths?.[0] ||
			toolPayload?.commandLine ||
			toolPayload?.command ||
			message.text

		return {
			...baseEvent,
			type: "tool",
			title: toolName ? `Tool · ${toolName}` : "Tool event",
			detail: truncateDetail(detail),
			sourceMessage: message,
		}
	}

	if (AGENT_SAY_TYPES.has(message.say || "") || AGENT_ASK_TYPES.has(message.ask || "")) {
		return {
			...baseEvent,
			type: "agent",
			title: message.say ? `Agent · ${message.say}` : `Agent · ${message.ask}`,
			detail: truncateDetail(message.text),
			sourceMessage: message,
		}
	}

	if (HOOK_SAY_TYPES.has(message.say || "") || HOOK_ASK_TYPES.has(message.ask || "")) {
		return {
			...baseEvent,
			type: "hook",
			title: message.say ? `Hook · ${message.say}` : `Hook · ${message.ask}`,
			detail: truncateDetail(message.text),
			sourceMessage: message,
		}
	}

	if (message.progressStatus?.text) {
		return {
			...baseEvent,
			type: "hook",
			title: "Hook · progress",
			detail: truncateDetail(message.progressStatus.text),
			sourceMessage: message,
		}
	}

	return null
}

export function buildChatEventTrace(messages: ClineMessage[]): ChatTraceEvent[] {
	if (!Array.isArray(messages)) return []

	return messages
		.map((message, index) => buildEventFromMessage(message, index))
		.filter((event): event is ChatTraceEvent => Boolean(event))
		.sort((a, b) => a.timestamp - b.timestamp)
}

interface ChatEventTraceProps {
	messages: ClineMessage[]
}

export const ChatEventTrace: FC<ChatEventTraceProps> = ({ messages }) => {
	const events = useMemo(() => buildChatEventTrace(messages), [messages])
	const grouped = useMemo(() => {
		return events.reduce<Record<ChatEventType, ChatTraceEvent[]>>(
			(acc, event) => {
				acc[event.type].push(event)
				return acc
			},
			{ agent: [], tool: [], subagent: [], hook: [] },
		)
	}, [events])

	return (
		<div className="w-full px-3 pb-3" data-testid="chat-event-trace">
			<div className="rounded-lg border border-vscode-panel-border bg-[var(--vscode-editor-background)] p-3 shadow-sm shadow-[color-mix(in_srgb,var(--vscode-editor-background)_60%,#000000_20%)]">
				<div className="mb-3 flex flex-col gap-1 text-sm">
					<p className="font-medium text-vscode-editor-foreground">Execution timeline</p>
					<span className="text-xs text-vscode-descriptionForeground">
						Visual trace of agent reasoning, tool calls, subtasks, and hook updates.
					</span>
					<span className="text-xs text-vscode-descriptionForeground">{events.length} events tracked</span>
				</div>
				<div className="grid gap-3 md:grid-cols-2" data-testid="chat-event-trace-groups">
					{(Object.keys(EVENT_CONFIG) as ChatEventType[]).map((type) => (
						<TraceGroup key={type} type={type} events={grouped[type]} />
					))}
				</div>
			</div>
		</div>
	)
}

interface TraceGroupProps {
	type: ChatEventType
	events: ChatTraceEvent[]
}

const TraceGroup: FC<TraceGroupProps> = ({ type, events }) => {
	const config = EVENT_CONFIG[type]
	const firstTimestamp = events[0]?.timestamp || 0

	const positions = useMemo(() => {
		if (events.length === 0) return []
		const min = events[0].timestamp
		const max = events[events.length - 1].timestamp
		const span = Math.max(max - min, 1)
		return events.map((event) => ({
			id: event.id,
			position: ((event.timestamp - min) / span) * 100,
		}))
	}, [events])

	return (
		<div className="flex flex-col gap-2" data-testid={`chat-event-trace-${type}`}>
			<div className="flex items-center justify-between">
				<div className="flex items-center gap-2">
					<span className={`h-2 w-2 rounded-full ${config.dotClass}`} aria-hidden="true" />
					<span className="text-xs font-medium uppercase tracking-wide text-vscode-descriptionForeground">
						{config.label}
					</span>
				</div>
				<span className="text-xs text-vscode-descriptionForeground">{events.length} events</span>
			</div>
			<div className="relative h-2 rounded-full bg-[color-mix(in_srgb,var(--vscode-editor-background)_70%,var(--vscode-editorGroup-border))]">
				{positions.map((dot) => (
					<span
						key={dot.id}
						className={`absolute top-1/2 h-2 w-2 -translate-y-1/2 rounded-full border border-[var(--vscode-editor-background)] ${config.dotClass}`}
						style={{ left: `${dot.position}%`, transform: "translate(-50%, -50%)" }}
					/>
				))}
			</div>
			<ul className="space-y-1">
				{events.length === 0 ? (
					<li className="text-xs text-vscode-descriptionForeground">{config.emptyLabel}</li>
				) : (
					events
						.slice(-2)
						.reverse()
						.map((event) => (
							<li key={event.id} className="rounded border border-vscode-panel-border bg-[color-mix(in_srgb,var(--vscode-editor-background)_85%,var(--vscode-editorGroup-border))] p-2">
								<p className="text-[11px] font-mono text-vscode-descriptionForeground">
									{formatRelativeTime(event.timestamp, firstTimestamp)}
								</p>
								<p className="text-sm font-medium text-vscode-editor-foreground">{event.title}</p>
								{event.detail && (
									<p className="text-xs text-vscode-descriptionForeground">{event.detail}</p>
								)}
							</li>
						))
				)}
			</ul>
		</div>
	)
}
