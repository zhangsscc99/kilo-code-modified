import { describe, expect, it } from "vitest"
import { RooCodeEventName, type ClineMessage } from "@roo-code/types"

import { buildWorkflowNodesFromTaskEvents, DEFAULT_WORKFLOW_BRANCH_ID } from "../taskEventGraph"
import type { ReceivedTaskEvent } from "@/types/taskEvents"

const baseTs = 1_700_000_000_000

const checkpointMessage: ClineMessage & { checkpoint: { from: string; to: string } } = {
	ts: baseTs + 2_000,
	type: "say",
	say: "checkpoint_saved",
	text: "hash-2",
	checkpoint: { from: "hash-1", to: "hash-2" },
}

const events: ReceivedTaskEvent[] = [
	{
		eventName: RooCodeEventName.TaskStarted,
		payload: ["123"],
		taskIdentifier: "123",
		taskEventTimestamp: baseTs,
	},
	{
		eventName: RooCodeEventName.Message,
		payload: [
			{
				taskId: "123",
				action: "created",
				message: { ts: baseTs + 1_000, type: "say", say: "text", text: "first" } as ClineMessage,
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
				message: checkpointMessage,
			},
		],
		taskIdentifier: "123",
		taskEventTimestamp: baseTs + 2_000,
	},
]

const branchCheckpointMessage: ClineMessage & { checkpoint: { from: string; to: string } } = {
	ts: baseTs + 3_000,
	type: "say",
	say: "checkpoint_saved",
	text: "hash-3",
	checkpoint: { from: "hash-2", to: "hash-3" },
}

describe("buildWorkflowNodesFromTaskEvents", () => {
	it("marks checkpoint snapshots with restore metadata", () => {
		const nodes = buildWorkflowNodesFromTaskEvents(events, {
			branchMetadata: {
				[DEFAULT_WORKFLOW_BRANCH_ID]: {
					id: DEFAULT_WORKFLOW_BRANCH_ID,
					label: "Branch A",
					parentSnapshotId: null,
					parentBranchId: null,
					createdAt: baseTs,
				},
			},
		})
		expect(nodes).toHaveLength(1)

		const checkpointNode = nodes[0]
		expect(checkpointNode.supportsCheckpointRestore).toBe(true)
		expect(checkpointNode.checkpoint?.hash).toBe("hash-2")
		expect(checkpointNode.checkpoint?.ts).toBe(baseTs + 2_000)
		expect(checkpointNode.snapshotTs).toBe(baseTs + 2_000)
		expect(checkpointNode.branchId).toBe(DEFAULT_WORKFLOW_BRANCH_ID)
		expect(checkpointNode.previousSnapshotId).toBeUndefined()
	})

	it("assigns branch lineage to new checkpoint nodes", () => {
		const branchedEvents: ReceivedTaskEvent[] = [
			...events,
			{
				eventName: RooCodeEventName.Message,
				payload: [
					{
						taskId: "123",
						action: "updated",
						message: branchCheckpointMessage,
					},
				],
				taskIdentifier: "123",
				taskEventTimestamp: baseTs + 3_000,
				branchId: "branch-b",
			},
		]
		const nodes = buildWorkflowNodesFromTaskEvents(branchedEvents, {
			branchMetadata: {
				[DEFAULT_WORKFLOW_BRANCH_ID]: {
					id: DEFAULT_WORKFLOW_BRANCH_ID,
					label: "Branch A",
					parentSnapshotId: null,
					parentBranchId: null,
					createdAt: baseTs,
				},
				"branch-b": {
					id: "branch-b",
					label: "Branch B",
					parentSnapshotId: "123#1",
					parentBranchId: DEFAULT_WORKFLOW_BRANCH_ID,
					createdAt: baseTs + 2_500,
				},
			},
		})
		expect(nodes).toHaveLength(2)
		const branchNode = nodes[1]
		expect(branchNode.branchId).toBe("branch-b")
		expect(branchNode.branchParentSnapshotId).toBe("123#1")
		expect(branchNode.previousSnapshotId).toBe("123#1")
	})
})
