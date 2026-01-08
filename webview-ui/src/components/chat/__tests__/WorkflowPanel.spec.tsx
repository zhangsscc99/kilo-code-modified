import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { vi } from "vitest"
import type { ClineMessage, TokenUsage, ToolUsage } from "@roo-code/types"
import { RooCodeEventName } from "@roo-code/types"
import { WorkflowPanel } from "../WorkflowPanel"
import { TooltipProvider } from "../../ui/tooltip"
import type { ReceivedTaskEvent } from "@/types/taskEvents"
import type { WorkflowBranchInfo } from "@/context/ExtensionStateContext"
import { DEFAULT_WORKFLOW_BRANCH_ID } from "@/utils/taskEventGraph"

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

const checkpointMessageBranchB = {
	ts: baseTs + 6_000,
	type: "say",
	say: "checkpoint_saved",
	text: "hash-2",
	checkpoint: { from: "hash-1", to: "hash-2" },
} as ClineMessage & { checkpoint: { from: string; to: string } }

const branchBEvent: ReceivedTaskEvent = {
	eventName: RooCodeEventName.Message,
	payload: [
		{
			taskId: "123",
			action: "updated",
			message: checkpointMessageBranchB,
		},
	],
	taskIdentifier: "123",
	branchId: "branch-b",
	taskEventTimestamp: baseTs + 6_000,
}

const baseBranches: WorkflowBranchInfo[] = [
	{
		id: DEFAULT_WORKFLOW_BRANCH_ID,
		label: "Branch A",
		parentSnapshotId: null,
		parentBranchId: null,
		createdAt: baseTs,
		status: "active",
	},
]

const multiBranchList: WorkflowBranchInfo[] = [
	{
		id: DEFAULT_WORKFLOW_BRANCH_ID,
		label: "Branch A",
		parentSnapshotId: null,
		parentBranchId: null,
		createdAt: baseTs,
		status: "archived",
	},
	{
		id: "branch-b",
		label: "Branch B",
		parentSnapshotId: "123#1",
		parentBranchId: DEFAULT_WORKFLOW_BRANCH_ID,
		createdAt: baseTs + 5_500,
		status: "active",
	},
]

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
					workflowBranches={baseBranches}
					activeBranchId={DEFAULT_WORKFLOW_BRANCH_ID}
					workflowRestoreState={baseWorkflowRestoreState}
					onRestoreNode={handleRestore}
					workflowNodeAnalyses={{}}
					onRequestNodeAnalysis={vi.fn()}
				/>
			</TooltipProvider>,
		)

		expect(screen.getByText(/Workflow 节点/)).toBeInTheDocument()
		expect(screen.getByText(/0 nodes · Branch A/)).toBeInTheDocument()
		expect(screen.getByText(/当前分支暂无 checkpoint 数据/)).toBeInTheDocument()
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
					workflowBranches={baseBranches}
					activeBranchId={DEFAULT_WORKFLOW_BRANCH_ID}
					workflowRestoreState={baseWorkflowRestoreState}
					onRestoreNode={handleRestore}
						workflowNodeAnalyses={{}}
						onRequestNodeAnalysis={vi.fn()}
				/>
			</TooltipProvider>,
		)

		expect(screen.getByText(/Workflow 节点/)).toBeInTheDocument()
		expect(screen.getByText(/1 nodes · Branch A/)).toBeInTheDocument()
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

	it("requests analysis when selecting 智能分析 tab", async () => {
		const user = userEvent.setup()
		const handleRestore = vi.fn()
		const handleAnalysis = vi.fn()
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
					workflowBranches={baseBranches}
					activeBranchId={DEFAULT_WORKFLOW_BRANCH_ID}
					workflowRestoreState={baseWorkflowRestoreState}
					onRestoreNode={handleRestore}
					workflowNodeAnalyses={{}}
					onRequestNodeAnalysis={handleAnalysis}
				/>
			</TooltipProvider>,
		)

		const workflowNodeButtons = screen.getAllByRole("button", { name: /1\.\s*triage/i })
		await user.click(workflowNodeButtons[0])
		await user.click(screen.getByRole("button", { name: "智能分析" }))
		expect(handleAnalysis).toHaveBeenCalledTimes(1)
		expect(handleAnalysis.mock.calls[0][0]).toMatchObject({ nodeId: expect.any(String), summary: expect.any(Object) })
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
					workflowBranches={baseBranches}
					activeBranchId={DEFAULT_WORKFLOW_BRANCH_ID}
					workflowRestoreState={baseWorkflowRestoreState}
					onRestoreNode={handleRestore}
						workflowNodeAnalyses={{}}
						onRequestNodeAnalysis={vi.fn()}
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
					workflowBranches={baseBranches}
					activeBranchId={DEFAULT_WORKFLOW_BRANCH_ID}
					workflowRestoreState={baseWorkflowRestoreState}
					onRestoreNode={handleRestore}
						workflowNodeAnalyses={{}}
						onRequestNodeAnalysis={vi.fn()}
				/>
			</TooltipProvider>,
		)

		const workflowNodeButtons = screen.getAllByRole("button", { name: /1\.\s*triage/i })
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
			expect.objectContaining({ branchId: DEFAULT_WORKFLOW_BRANCH_ID }),
		)
	})

	it("renders all branches tree view", async () => {
		const user = userEvent.setup()
		const handleRestore = vi.fn()
		render(
			<TooltipProvider>
				<WorkflowPanel
					messages={[...messages, checkpointMessage, checkpointMessageBranchB]}
					taskEvents={[...sharedTaskEvents, checkpointTaskEvent, branchBEvent]}
					collapsed={false}
					onToggleCollapse={() => {}}
					onClose={() => {}}
					agentState={{ statusLabel: "Idle", messageCount: messages.length + 2 }}
					currentCheckpoint={undefined}
					workflowBranches={multiBranchList}
					activeBranchId="branch-b"
					workflowRestoreState={baseWorkflowRestoreState}
					onRestoreNode={handleRestore}
						workflowNodeAnalyses={{}}
						onRequestNodeAnalysis={vi.fn()}
				/>
			</TooltipProvider>,
		)

		await user.click(screen.getByRole("button", { name: /全部分支/ }))
		const branchBTreeNode = await screen.findByRole("button", { name: /查看\s+Branch B/i })
		expect(branchBTreeNode).toBeInTheDocument()
		await user.click(branchBTreeNode)
		expect(screen.getByText(/nodes · Branch B/)).toBeInTheDocument()
	})
})
