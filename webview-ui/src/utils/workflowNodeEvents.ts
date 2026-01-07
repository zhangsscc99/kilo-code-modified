import type { WorkflowGraphNode } from "@/utils/taskEventGraph"
import type { ChatTraceEvent } from "@/components/chat/ChatEventTrace"
import type { ClineMessage } from "@roo-code/types"
import { safeJsonParse } from "@roo/safeJsonParse"

const USER_SAY_TYPES = new Set(["user_feedback", "user_feedback_diff"])

export interface EnhancedWorkflowEventsData {
	stats: {
		toolCount: number
		toolSuccessCount: number
		toolFailureCount: number
		hookCount: number
		agentCount: number
		subagentCount: number
		totalTokensIn: number
		totalTokensOut: number
		durationMs?: number
	}
	toolEvents: EnhancedEventSummary[]
	hookEvents: EnhancedEventSummary[]
	userEvents: EnhancedUserSummary[]
	agentEvents: EnhancedAgentSummary[]
	subagentEvents: EnhancedAgentSummary[]
	isEmpty: boolean
}

export interface EnhancedEventSummary {
	id: string
	name?: string
	action?: string
	status?: string
	outcome?: "success" | "failure"
	detail?: string
	tokensIn?: number
	tokensOut?: number
	exitCode?: number
	timestamp?: number
}

export interface EnhancedAgentSummary {
	id: string
	label: string
	text?: string
	timestamp?: number
}

export interface EnhancedUserSummary {
	id: string
	label: string
	text?: string
	timestamp?: number
}

export function buildEnhancedWorkflowEvents(node: WorkflowGraphNode): EnhancedWorkflowEventsData {
	const stats = {
		toolCount: 0,
		toolSuccessCount: 0,
		toolFailureCount: 0,
		hookCount: 0,
		agentCount: 0,
		subagentCount: 0,
		totalTokensIn: 0,
		totalTokensOut: 0,
		durationMs:
			node.startedAt && node.completedAt && node.completedAt >= node.startedAt
				? node.completedAt - node.startedAt
				: undefined,
	}
	const toolEvents: EnhancedEventSummary[] = []
	const hookEvents: EnhancedEventSummary[] = []
	const userEvents: EnhancedUserSummary[] = []
	const agentEvents: EnhancedAgentSummary[] = []
	const subagentEvents: EnhancedAgentSummary[] = []

	for (const event of node.events) {
		const source = event.sourceMessage
		const parsed = typeof source?.text === "string" ? safeJsonParse<Record<string, any>>(source.text, undefined) : undefined
		const exitCode = extractExitCode(source, parsed)
		const toolOutcome = event.type === "tool" ? deriveToolOutcome(source, parsed, exitCode) : undefined
		const tokenUsage = extractTokenUsage(source, parsed)
		if (typeof tokenUsage.tokensIn === "number") {
			stats.totalTokensIn += tokenUsage.tokensIn
		}
		if (typeof tokenUsage.tokensOut === "number") {
			stats.totalTokensOut += tokenUsage.tokensOut
		}

		switch (event.type) {
			case "tool": {
				stats.toolCount += 1
				if (toolOutcome === "success") {
					stats.toolSuccessCount += 1
				} else if (toolOutcome === "failure") {
					stats.toolFailureCount += 1
				}
				toolEvents.push({
					id: event.id,
					name: deriveToolName(event.title),
					action: source?.ask || source?.say || event.title,
					status: deriveToolStatus(source),
					outcome: toolOutcome,
					detail: truncateEventDetail(deriveToolDetail(event, parsed)),
					tokensIn: tokenUsage.tokensIn,
					tokensOut: tokenUsage.tokensOut,
					exitCode,
					timestamp: event.timestamp,
				})
				break
			}
			case "hook": {
				stats.hookCount += 1
				hookEvents.push({
					id: event.id,
					name: event.title,
					action: source?.say || source?.ask,
					status: deriveHookStatus(source),
					detail: truncateEventDetail(deriveHookDetail(event, parsed)),
					tokensIn: tokenUsage.tokensIn,
					tokensOut: tokenUsage.tokensOut,
					timestamp: event.timestamp,
				})
				break
			}
		case "agent": {
			if (isUserFeedbackMessage(source)) {
				userEvents.push({
					id: event.id,
					label: source?.say ? `用户 · ${source.say}` : event.title,
					text: truncateEventDetail(event.detail || source?.text || parsed?.message || parsed?.content),
					timestamp: event.timestamp,
				})
				break
			}
			stats.agentCount += 1
			agentEvents.push({
				id: event.id,
				label: event.title,
				text: truncateEventDetail(event.detail || parsed?.text || parsed?.content),
				timestamp: event.timestamp,
			})
			break
		}
			case "subagent": {
				stats.subagentCount += 1
				subagentEvents.push({
					id: event.id,
					label: event.title,
					text: truncateEventDetail(event.detail || parsed?.text || parsed?.message),
					timestamp: event.timestamp,
				})
				break
			}
		}
	}

	appendUserPromptFromNode(node, userEvents)

	return {
		stats,
		toolEvents,
		hookEvents,
		userEvents,
		agentEvents,
		subagentEvents,
		isEmpty:
			!toolEvents.length &&
			!hookEvents.length &&
			!userEvents.length &&
			!agentEvents.length &&
			!subagentEvents.length,
	}
}

function appendUserPromptFromNode(node: WorkflowGraphNode, userEvents: EnhancedUserSummary[]) {
	if (userEvents.length > 0) {
		return
	}
	const message = node.userMessage
	if (!message) {
		return
	}
	userEvents.push({
		id: message.ts ? `${node.id}-user-${message.ts}` : `${node.id}-user`,
		label: message.say ? `用户 · ${message.say}` : "用户输入",
		text: truncateEventDetail(message.text),
		timestamp: message.ts,
	})
}

function deriveToolName(title?: string) {
	if (!title) return undefined
	if (title.startsWith("Tool · ")) {
		return title.replace("Tool · ", "")
	}
	return title
}

function deriveToolDetail(event: ChatTraceEvent, parsed?: Record<string, any>) {
	return (
		event.detail ||
		parsed?.path ||
		parsed?.workspaceFile ||
		parsed?.paths?.[0] ||
		parsed?.commandLine ||
		parsed?.command ||
		parsed?.output ||
		parsed?.result ||
		parsed?.message
	)
}


function deriveToolStatus(message?: ClineMessage) {
	if (!message) return undefined
	const say = message.say as string | undefined
	if (say === "command_output" || say === "tool_result") {
		return "完成"
	}
	if (message.ask === "tool") {
		return "调用"
	}
	return say || message.ask
}

function deriveToolOutcome(message?: ClineMessage, parsed?: Record<string, any>, exitCode?: number) {
	if (!message) return undefined
	if (typeof exitCode === "number") {
		return exitCode === 0 ? "success" : "failure"
	}
	const say = message.say as string | undefined
	if (say === "command_output" || say === "tool_result") {
		return "success"
	}
	if (say === "tool_error" || say === "command_error") {
		return "failure"
	}
	const status = (message as Record<string, any>).status ?? parsed?.status
	if (typeof status === "string") {
		if (/error|fail|exception|timeout/i.test(status)) {
			return "failure"
		}
		if (/success|ok|done|completed/i.test(status)) {
			return "success"
		}
	}
	const successFlag = (message as Record<string, any>).success ?? parsed?.success ?? parsed?.ok
	if (typeof successFlag === "boolean") {
		return successFlag ? "success" : "failure"
	}
	return undefined
}

function deriveHookStatus(message?: ClineMessage) {
	if (!message) return undefined
	return message.say || message.ask
}

function deriveHookDetail(event: ChatTraceEvent, parsed?: Record<string, any>) {
	if (event.detail) return event.detail
	if (!parsed) return undefined
	if (parsed.apiProtocol) {
		return `${parsed.apiProtocol}${parsed.route ? ` · ${parsed.route}` : ""}`
	}
	return parsed.message || parsed.status || parsed.detail
}

function truncateEventDetail(text?: string, limit = 140) {
	if (!text) return undefined
	const trimmed = text.trim()
	if (!trimmed) return undefined
	return trimmed.length > limit ? `${trimmed.slice(0, limit)}...` : trimmed
}

function extractTokenUsage(message?: ClineMessage, parsed?: Record<string, any>) {
	const sources: Array<Record<string, any> | undefined> = [
		message as Record<string, any>,
		(message as Record<string, any>)?.metadata,
		parsed,
		parsed?.metadata,
		parsed?.usage,
		parsed?.tokenUsage,
	]
	return {
		tokensIn: pickNumericValue(sources, TOKEN_INPUT_KEYS),
		tokensOut: pickNumericValue(sources, TOKEN_OUTPUT_KEYS),
	}
}

function extractExitCode(message?: ClineMessage, parsed?: Record<string, any>) {
	const sources: Array<Record<string, any> | undefined> = [
		message as Record<string, any>,
		(message as Record<string, any>)?.metadata,
		parsed,
		parsed?.metadata,
	]
	for (const source of sources) {
		if (!source) continue
		const value = source.exitCode ?? source.code ?? source.statusCode
		if (typeof value === "number" && Number.isFinite(value)) {
			return value
		}
		if (typeof value === "string" && value.trim().length > 0) {
			const parsedCode = Number(value)
			if (!Number.isNaN(parsedCode)) {
				return parsedCode
			}
		}
	}
	return undefined
}

function isUserFeedbackMessage(message?: ClineMessage) {
	if (!message) return false
	const say = message.say as string | undefined
	const ask = message.ask as string | undefined
	if (say && USER_SAY_TYPES.has(say)) return true
	if (ask && USER_SAY_TYPES.has(ask)) return true
	return false
}

const TOKEN_INPUT_KEYS = ["tokensIn", "tokenIn", "inputTokens", "tokens_input", "tokens_in", "input_tokens"]
const TOKEN_OUTPUT_KEYS = ["tokensOut", "tokenOut", "outputTokens", "tokens_output", "tokens_out", "output_tokens"]

function pickNumericValue(sources: Array<Record<string, any> | undefined>, keys: string[]) {
	for (const source of sources) {
		if (!source) continue
		for (const key of keys) {
			const value = source[key]
			if (typeof value === "number") {
				return value
			}
			if (typeof value === "string") {
				const parsed = Number(value)
				if (!Number.isNaN(parsed)) {
					return parsed
				}
			}
		}
	}
	return undefined
}
