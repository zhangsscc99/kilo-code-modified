import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { ClineMessage, TokenUsage, ToolUsage } from "@roo-code/types"
import { RooCodeEventName } from "@roo-code/types"
import { WorkflowPanel } from "../WorkflowPanel"
import { TooltipProvider } from "../../ui/tooltip"
import type { ReceivedTaskEvent } from "@/types/taskEvents"

const baseTs = 1_700_000_000_000

const messages: ClineMessage[] = [
	{ type: "say", say: "text", text: "Task", ts: baseTs },
	{ type: "ask", ask: "tool", text: JSON.stringify({ tool: "read_file" }), ts: baseTs + 1_000 },
	{ type: "say", say: "command_output", text: "done", ts: baseTs + 2_000 },
	{ type: "say", say: "text", text: "response", ts: baseTs + 3_000 },
]

const tokenUsage: TokenUsage = {
	totalTokensIn: 0,
	totalTokensOut: 0,
	totalCacheWrites: 0,
	totalCacheReads: 0,
	totalCost: 0,
	contextTokens: 0,
}

const toolUsage: ToolUsage = {
	read_file: { attempts: 0, failures: 0 },
}

const taskEvents: ReceivedTaskEvent[] = [
	{
		eventName: RooCodeEventName.TaskStarted,
		payload: ["123"],
		taskIdentifier: "123",
		taskEventTimestamp: baseTs,
	},
	{
		eventName: RooCodeEventName.TaskModeSwitched,
		payload: ["123", "triage"],
		taskIdentifier: "123",
		taskEventTimestamp: baseTs + 500,
	},
	{
		eventName: RooCodeEventName.Message,
		payload: [
			{
				taskId: "123",
				action: "created",
				message: messages[0],
			},
		],
		taskIdentifier: "123",
		taskEventTimestamp: baseTs + 750,
	},
	{
		eventName: RooCodeEventName.Message,
		payload: [
			{
				taskId: "123",
				action: "updated",
				message: messages[3],
			},
		],
		taskIdentifier: "123",
		taskEventTimestamp: baseTs + 3_000,
	},
	{
		eventName: RooCodeEventName.TaskCompleted,
		payload: ["123", tokenUsage, toolUsage, { isSubtask: false }],
		taskIdentifier: "123",
		taskEventTimestamp: baseTs + 4_000,
	},
]

describe("WorkflowPanel", () => {
	it("renders tabbed layout and switches between panels", async () => {
		const user = userEvent.setup()
		render(
			<TooltipProvider>
				<WorkflowPanel
					messages={messages}
					taskEvents={taskEvents}
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
		expect(screen.getByText(/2 nodes/)).toBeInTheDocument()
		expect(screen.getByText(/1\. triage/i)).toBeInTheDocument()
		await user.click(screen.getByRole("button", { name: /Agent State/i }))
		expect(screen.getByText(/Agent 状态/)).toBeInTheDocument()
		await user.click(screen.getByRole("button", { name: /Agent Events/i }))
		expect(screen.getByText(/Agent 事件/)).toBeInTheDocument()
		await user.click(screen.getByRole("button", { name: /Workflow/i }))
		const workflowNodeButtons = screen.getAllByRole("button", { name: /1\.\s*triage/i })
		await user.click(workflowNodeButtons[0])
		expect(screen.getByText(/内部事件/)).toBeInTheDocument()
	})

	it("renders collapsed summary when collapsed", () => {
		render(
			<TooltipProvider>
				<WorkflowPanel
					messages={[]}
					taskEvents={[]}
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
