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
	{ type: "ask", ask: "tool", text: JSON.stringify({ tool: "read_file" }), ts: baseTs + 1_000 },
	{ type: "say", say: "command_output", text: "done", ts: baseTs + 2_000 },
	{ type: "say", say: "text", text: "response", ts: baseTs + 3_000 },
]

const checkpointMessage = {
	ts: baseTs + 4_500,
	type: "say",
	say: "checkpoint_saved",
	text: "hash-1",
	checkpoint: { from: "hash-0", to: "hash-1" },
} as ClineMessage & { checkpoint: { from: string; to: string } }

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

const baseWorkflowRestoreState = {
	pendingSnapshotId: null,
	lastCompletedSnapshotId: null,
	lastError: null,
}

const sharedTaskEvents: ReceivedTaskEvent[] = [
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
		eventName: RooCodeEventName.TaskCompleted,
		payload: ["123", tokenUsage, toolUsage, { isSubtask: false }],
		taskIdentifier: "123",
		taskEventTimestamp: baseTs + 4_000,
	},
]

const checkpointTaskEvent: ReceivedTaskEvent = {
	eventName: RooCodeEventName.Message,
	payload: [
		{
			taskId: "123",
			action: "updated",
			message: checkpointMessage,
		},
	],
	taskIdentifier: "123",
	taskEventTimestamp: baseTs + 4_500,
}

describe("WorkflowPanel", () => {
	it("renders empty state when no checkpoints exist", () => {
		const handleRestore = vi.fn()
		render(
			<TooltipProvider>
				<WorkflowPanel
					messages={messages}
					taskEvents={sharedTaskEvents}
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
					currentCheckpoint={undefined}
					workflowRestoreState={baseWorkflowRestoreState}
					onRestoreNode={handleRestore}
				/>
			</TooltipProvider>,
		)

		expect(screen.getByText(/Workflow 节点/)).toBeInTheDocument()
		expect(screen.getByText(/0 nodes/)).toBeInTheDocument()
		expect(screen.getByText(/暂无 checkpoint 数据/)).toBeInTheDocument()
	})

	it("renders tabbed layout and switches between panels", async () => {
		const user = userEvent.setup()
		const handleRestore = vi.fn()
		render(
			<TooltipProvider>
				<WorkflowPanel
					messages={[...messages, checkpointMessage]}
					taskEvents={[...sharedTaskEvents, checkpointTaskEvent]}
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
					currentCheckpoint={undefined}
					workflowRestoreState={baseWorkflowRestoreState}
					onRestoreNode={handleRestore}
				/>
			</TooltipProvider>,
		)

		expect(screen.getByText(/Workflow 节点/)).toBeInTheDocument()
		expect(screen.getByText(/1 nodes/)).toBeInTheDocument()
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
		const handleRestore = vi.fn()
		render(
			<TooltipProvider>
				<WorkflowPanel
					messages={[]}
					taskEvents={[]}
					collapsed={true}
					onToggleCollapse={() => {}}
					onClose={() => {}}
					agentState={{ statusLabel: "Idle", messageCount: 0 }}
					currentCheckpoint={undefined}
					workflowRestoreState={baseWorkflowRestoreState}
					onRestoreNode={handleRestore}
				/>
			</TooltipProvider>,
		)

		expect(screen.getByText(/Workflow panel/)).toBeInTheDocument()
	})

	it("shows restore button for checkpoint nodes", async () => {
		const user = userEvent.setup()
		const handleRestore = vi.fn()
		const extendedMessages = [...messages, checkpointMessage]
		render(
			<TooltipProvider>
				<WorkflowPanel
					messages={extendedMessages}
					taskEvents={[...sharedTaskEvents, checkpointTaskEvent]}
					collapsed={false}
					onToggleCollapse={() => {}}
					onClose={() => {}}
					agentState={{ statusLabel: "Idle", messageCount: extendedMessages.length }}
					currentCheckpoint="hash-1"
					workflowRestoreState={baseWorkflowRestoreState}
					onRestoreNode={handleRestore}
				/>
			</TooltipProvider>,
		)

		const workflowNodeButtons = screen.getAllByRole("button", { name: /Agent/i })
		await user.click(workflowNodeButtons[workflowNodeButtons.length - 1])
		const restoreButton = await screen.findByRole("button", { name: "回溯到 checkpoint" })
		expect(restoreButton).toBeInTheDocument()
		await user.click(restoreButton)
		expect(handleRestore).toHaveBeenCalledWith(
			expect.objectContaining({
				snapshotId: expect.any(String),
				checkpointHash: "hash-1",
				strategy: "checkpoint-only",
			}),
		)
	})
})
