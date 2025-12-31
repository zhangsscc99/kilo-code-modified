import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { vi } from "vitest"
import type { ClineMessage, TokenUsage, ToolUsage } from "@roo-code/types"
import { RooCodeEventName } from "@roo-code/types"
import { WorkflowPanel } from "../WorkflowPanel"
import { TooltipProvider } from "../../ui/tooltip"
import type { ReceivedTaskEvent } from "@/types/taskEvents"

const baseTs = 1_700_000_000_000

const messages: ClineMessage[] = [
	{ type: "say", say: "text", text: "Task", ts: baseTs },
	{ type: "say", say: "checkpoint_saved", text: "deadbeefcafebabe", ts: baseTs + 500 },
	{ type: "say", say: "text", text: "response", ts: baseTs + 1_000 },
	{ type: "ask", ask: "tool", text: JSON.stringify({ tool: "read_file" }), ts: baseTs + 1_500 },
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
		taskEventTimestamp: baseTs + 200,
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
		taskEventTimestamp: baseTs + 100,
	},
	{
		eventName: RooCodeEventName.Message,
		payload: [
			{
				taskId: "123",
				action: "created",
				message: messages[1],
			},
		],
		taskIdentifier: "123",
		taskEventTimestamp: baseTs + 600,
	},
	{
		eventName: RooCodeEventName.Message,
		payload: [
			{
				taskId: "123",
				action: "updated",
				message: messages[2],
			},
		],
		taskIdentifier: "123",
		taskEventTimestamp: baseTs + 1_000,
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
		taskEventTimestamp: baseTs + 1_600,
	},
	{
		eventName: RooCodeEventName.Message,
		payload: [
			{
				taskId: "123",
				action: "updated",
				message: messages[4],
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

type WorkflowPanelProps = React.ComponentProps<typeof WorkflowPanel>

const renderWorkflowPanel = (overrideProps: Partial<WorkflowPanelProps> = {}) => {
	const props: WorkflowPanelProps = {
		messages,
		taskEvents,
		collapsed: false,
		onToggleCollapse: () => {},
		onClose: () => {},
		agentState: {
			statusLabel: "Streaming",
			mode: "code",
			taskLabel: "task",
			messageCount: messages.length,
			lastEvent: "response",
			lastUpdated: "now",
		},
		workflowRestoreState: {},
		onRequestRestoreNode: vi.fn(),
		...overrideProps,
	}

	return {
		props,
		...render(
			<TooltipProvider>
				<WorkflowPanel {...props} />
			</TooltipProvider>,
		),
	}
}

describe("WorkflowPanel", () => {
	it("renders tabbed layout and switches between panels", async () => {
		const user = userEvent.setup()
		renderWorkflowPanel()

		expect(screen.getByText(/Workflow 节点/)).toBeInTheDocument()
		expect(screen.getByText(/4 nodes/)).toBeInTheDocument()
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
		renderWorkflowPanel({ messages: [], taskEvents: [], collapsed: true, agentState: { statusLabel: "Idle", messageCount: 0 } })
		expect(screen.getByText(/Workflow panel/)).toBeInTheDocument()
	})

	it("sends restore request when clicking node action", async () => {
		const user = userEvent.setup()
		const onRequestRestoreNode = vi.fn()
		renderWorkflowPanel({ onRequestRestoreNode })

		await user.click(screen.getByRole("button", { name: /2\.\s*triage/i }))
		expect(screen.getByText(/Checkpoint: deadbeef/)).toBeInTheDocument()
		const restoreButton = screen.getByRole("button", { name: "回到此节点" })
		await user.click(restoreButton)

		expect(onRequestRestoreNode).toHaveBeenCalledTimes(1)
		expect(onRequestRestoreNode).toHaveBeenCalledWith(
			expect.objectContaining({
				snapshotId: expect.stringContaining("#2"),
				taskId: "123",
				checkpointHash: "deadbeefcafebabe",
			}),
		)
	})
})
