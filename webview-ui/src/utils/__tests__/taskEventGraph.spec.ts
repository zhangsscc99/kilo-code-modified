import { describe, expect, it } from "vitest"
import { RooCodeEventName, type ClineMessage } from "@roo-code/types"

import { buildWorkflowNodesFromTaskEvents } from "../taskEventGraph"
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

describe("buildWorkflowNodesFromTaskEvents", () => {
	it("marks checkpoint snapshots with restore metadata", () => {
		const nodes = buildWorkflowNodesFromTaskEvents(events)
		expect(nodes).toHaveLength(1)

		const checkpointNode = nodes[0]
		expect(checkpointNode.supportsCheckpointRestore).toBe(true)
		expect(checkpointNode.checkpoint?.hash).toBe("hash-2")
		expect(checkpointNode.checkpoint?.ts).toBe(baseTs + 2_000)
		expect(checkpointNode.snapshotTs).toBe(baseTs + 2_000)
	})
})
