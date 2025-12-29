import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { ClineMessage } from "@roo-code/types"
import { WorkflowPanel } from "../WorkflowPanel"
import { TooltipProvider } from "../../ui/tooltip"

const baseTs = 1_700_000_000_000

const messages: ClineMessage[] = [
	{ type: "say", say: "text", text: "Task", ts: baseTs },
	{ type: "ask", ask: "tool", text: JSON.stringify({ tool: "read_file" }), ts: baseTs + 1_000 },
	{ type: "say", say: "command_output", text: "done", ts: baseTs + 2_000 },
	{ type: "say", say: "text", text: "response", ts: baseTs + 3_000 },
]

describe("WorkflowPanel", () => {
	it("renders tabbed layout and switches between panels", async () => {
		const user = userEvent.setup()
		render(
			<TooltipProvider>
				<WorkflowPanel
					messages={messages}
					collapsed={false}
					onToggleCollapse={() => {}}
					onClose={() => {}}
					agentState={{
						statusLabel: "Streaming",
						mode: "code",
						taskLabel: "task",
						messageCount: messages.length,
						lastEvent: "response",
						lastUpdated: "now",
					}}
				/>
			</TooltipProvider>,
		)

		expect(screen.getByText(/Workflow 节点/)).toBeInTheDocument()
		await user.click(screen.getByRole("button", { name: /Agent State/i }))
		expect(screen.getByText(/Agent 状态/)).toBeInTheDocument()
		await user.click(screen.getByRole("button", { name: /Agent Events/i }))
		expect(screen.getByText(/Agent 事件/)).toBeInTheDocument()
	})

	it("renders collapsed summary when collapsed", () => {
		render(
			<TooltipProvider>
				<WorkflowPanel
					messages={[]}
					collapsed={true}
					onToggleCollapse={() => {}}
					onClose={() => {}}
					agentState={{ statusLabel: "Idle", messageCount: 0 }}
				/>
			</TooltipProvider>,
		)

		expect(screen.getByText(/Workflow panel/)).toBeInTheDocument()
	})
})
