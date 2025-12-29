import { render, screen, within } from "@testing-library/react"
import type { ClineMessage } from "@roo-code/types"
import { ChatEventTrace, buildChatEventTrace } from "../ChatEventTrace"

describe("ChatEventTrace", () => {
	const baseTs = 1_700_000_000_000
	const sampleMessages: ClineMessage[] = [
		{ type: "say", say: "text", ts: baseTs, text: "initial" },
		{ type: "ask", ask: "tool", ts: baseTs + 1_000, text: JSON.stringify({ tool: "read_file", path: "/tmp/demo.txt" }) },
		{ type: "say", say: "command_output", ts: baseTs + 1_500, text: "done" },
		{ type: "say", say: "text", ts: baseTs + 2_000, text: "Agent reply" },
		{ type: "say", say: "subtask_result", ts: baseTs + 2_500, text: "Subtask completed" },
		{ type: "ask", ask: "condense", ts: baseTs + 3_000, text: "Condense" },
	]

	it("builds grouped events with predictable ordering", () => {
		const events = buildChatEventTrace(sampleMessages)
		const counts = events.reduce(
			(acc, event) => {
				acc[event.type] = (acc[event.type] || 0) + 1
				return acc
			},
			{} as Record<string, number>,
		)

		expect(events).toHaveLength(5)
		expect(counts.tool).toBe(2)
		expect(counts.agent).toBe(1)
		expect(counts.subagent).toBe(1)
		expect(counts.hook).toBe(1)
		// Ensure events are sorted by timestamp ascending
		const timestamps = events.map((event) => event.timestamp)
		const sorted = [...timestamps].sort((a, b) => a - b)
		expect(timestamps).toEqual(sorted)
	})

	it("renders placeholders when no messages are available", () => {
		render(<ChatEventTrace messages={[]} />)
		expect(screen.getByTestId("chat-event-trace")).toBeInTheDocument()
		expect(screen.getByText(/no agent activity/i)).toBeInTheDocument()
		expect(screen.getByText(/0 events tracked/i)).toBeInTheDocument()
	})

	it("renders counts per event type", () => {
		render(<ChatEventTrace messages={sampleMessages} />)
		const toolGroup = within(screen.getByTestId("chat-event-trace-tool"))
		expect(toolGroup.getByText(/2 events/)).toBeInTheDocument()

		const agentGroup = within(screen.getByTestId("chat-event-trace-agent"))
		expect(agentGroup.getByText(/1 events/)).toBeInTheDocument()

		const hookGroup = within(screen.getByTestId("chat-event-trace-hook"))
		expect(hookGroup.getByText(/1 events/)).toBeInTheDocument()
	})
})
