import { describe, expect, it } from "vitest"

import { buildEnhancedWorkflowEvents } from "../workflowNodeEvents"
import type { WorkflowGraphNode } from "../taskEventGraph"
import type { ChatTraceEvent } from "@/components/chat/ChatEventTrace"
import type { ClineMessage } from "@roo-code/types"

const baseNode: WorkflowGraphNode = {
	id: "task#1",
	taskId: "task",
	label: "task",
	parentIds: [],
	childIds: [],
	events: [],
	supportsCheckpointRestore: false,
	branchId: "branch-main",
}

const createEvent = (overrides: Partial<ChatTraceEvent>): ChatTraceEvent => ({
	id: "evt",
	title: "Tool · example",
	timestamp: 1,
	type: "tool",
	...overrides,
})

const createMessage = (overrides: Partial<ClineMessage>): ClineMessage => ({
	ts: overrides.ts ?? 1,
	type: overrides.type ?? "say",
	...overrides,
} as ClineMessage)

describe("buildEnhancedWorkflowEvents", () => {
	it("categorizes events and aggregates metrics", () => {
		const toolCall = createEvent({
			id: "tool-call",
			type: "tool",
			title: "Tool · read_file",
			sourceMessage: createMessage({
				type: "ask",
				ask: "tool",
				text: JSON.stringify({ tool: "read_file", path: "src/app.ts", tokenUsage: { tokens_output: 3 } }),
				metadata: { tokensIn: 10 } as Record<string, any>,
			}),
		})

		const toolResult = createEvent({
			id: "tool-result",
			type: "tool",
			title: "Tool · run_script",
			timestamp: 2,
			sourceMessage: createMessage({
				type: "say",
				say: "command_output",
				metadata: { tokensOut: 5 } as Record<string, any>,
			}),
		})

		const toolError = createEvent({
			id: "tool-error",
			type: "tool",
			title: "Tool · run_script",
			timestamp: 4,
			sourceMessage: createMessage({
				type: "say",
				say: "tool_error" as any,
				metadata: { exitCode: 2 } as Record<string, any>,
			}),
		})

		const hookEvent = createEvent({
			id: "hook",
			type: "hook",
			title: "api_req_finished",
			sourceMessage: createMessage({
				say: "api_req_finished",
				text: JSON.stringify({ apiProtocol: "https", route: "/tasks" }),
			}),
		})

		const longText = `${"A".repeat(200)} detail`
		const agentEvent = createEvent({
			id: "agent",
			type: "agent",
			title: "Agent · text",
			detail: longText,
			timestamp: 3,
		})

		const userEvent = createEvent({
			id: "user",
			type: "agent",
			title: "Agent · user_feedback",
			timestamp: 3,
			sourceMessage: createMessage({
				say: "user_feedback",
				text: "Please summarize the repo",
			}),
		})

		const subagentEvent = createEvent({
			id: "subagent",
			type: "subagent",
			title: "Delegate",
			sourceMessage: createMessage({ text: "child task spawned" }),
		})

			const node: WorkflowGraphNode = {
				...baseNode,
				events: [toolCall, toolResult, toolError, hookEvent, agentEvent, userEvent, subagentEvent],
				startedAt: 1000,
				completedAt: 4000,
				userMessage: userEvent.sourceMessage,
			}

		const data = buildEnhancedWorkflowEvents(node)
		expect(data.stats).toMatchObject({
			toolCount: 3,
			toolSuccessCount: 1,
			toolFailureCount: 1,
			hookCount: 1,
			agentCount: 1,
			subagentCount: 1,
			totalTokensIn: 10,
			totalTokensOut: 8,
			durationMs: 3000,
		})
		expect(data.toolEvents[0]).toMatchObject({
			name: "read_file",
			status: "调用",
			detail: "src/app.ts",
			tokensIn: 10,
			tokensOut: 3,
		})
		expect(data.toolEvents[1]).toMatchObject({ status: "完成", tokensOut: 5, outcome: "success" })
		expect(data.toolEvents[2]).toMatchObject({ status: "tool_error", outcome: "failure", exitCode: 2 })
		expect(data.hookEvents[0]).toMatchObject({ detail: "https · /tasks" })
		expect(data.agentEvents[0].text?.length).toBeLessThanOrEqual(143)
			expect(data.userEvents).toHaveLength(1)
			expect(data.userEvents[0]).toMatchObject({ label: "用户 · user_feedback", text: "Please summarize the repo" })
			expect(data.subagentEvents).toHaveLength(1)
			expect(data.isEmpty).toBe(false)
		})

		it("falls back to node.userMessage when events lack explicit user entries", () => {
			const userMessage = createMessage({ ts: 42, type: "say", say: "user_feedback", text: "你好" })
			const node: WorkflowGraphNode = {
				...baseNode,
				events: [],
				userMessage,
			}
			const data = buildEnhancedWorkflowEvents(node)
			expect(data.userEvents).toHaveLength(1)
			expect(data.userEvents[0]).toMatchObject({ label: "用户 · user_feedback", text: "你好", timestamp: 42 })
		})

	it("returns empty state when no events are present", () => {
		const node: WorkflowGraphNode = {
			...baseNode,
			events: [],
			startedAt: undefined,
			completedAt: undefined,
		}
		const data = buildEnhancedWorkflowEvents(node)
		expect(data.stats).toMatchObject({
			toolCount: 0,
			toolSuccessCount: 0,
			toolFailureCount: 0,
			hookCount: 0,
			agentCount: 0,
			subagentCount: 0,
			totalTokensIn: 0,
			totalTokensOut: 0,
			durationMs: undefined,
		})
		expect(data.isEmpty).toBe(true)
		expect(data.toolEvents).toHaveLength(0)
		expect(data.hookEvents).toHaveLength(0)
		expect(data.userEvents).toHaveLength(0)
		expect(data.agentEvents).toHaveLength(0)
		expect(data.subagentEvents).toHaveLength(0)
	})
})
