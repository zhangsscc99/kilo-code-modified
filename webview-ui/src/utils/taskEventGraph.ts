import { RooCodeEventName, type ClineMessage } from "@roo-code/types"

import { buildChatEventTrace, type ChatTraceEvent } from "@/components/chat/ChatEventTrace"
import type { ReceivedTaskEvent } from "@/types/taskEvents"

export interface WorkflowGraphNode {
	id: string
	taskId: string
	stepIndex?: number
	label: string
	mode?: string
	startedAt?: number
	completedAt?: number
	parentIds: string[]
	childIds: string[]
	events: ChatTraceEvent[]
	checkpointHash?: string
	checkpointTs?: number
}

const UNKNOWN_TASK_ID = "unknown-task"

interface TaskTimeline {
	id: string
	label?: string
	mode?: string
	startedAt?: number
	completedAt?: number
	parentIds: Set<string>
	childIds: Set<string>
	messages: ClineMessage[]
	stepCounter: number
	lastSnapshot?: WorkflowGraphNode
	lastCheckpointHash?: string
	lastCheckpointTs?: number
}

interface ForwardedMessagePayload {
	action?: string
	taskId?: string
	message?: ClineMessage
}

function ensureString(value: unknown): string | undefined {
	return typeof value === "string" ? value : undefined
}

function isMessagePayload(value: unknown): value is ForwardedMessagePayload {
	return typeof value === "object" && value !== null && "message" in value
}

function extractCheckpointHash(message: ClineMessage): { hash: string; ts: number } | undefined {
	const checkpointRecord = message.checkpoint as Record<string, unknown> | undefined
	const hashFromCheckpoint = checkpointRecord
		? ensureString(checkpointRecord.hash) || ensureString(checkpointRecord.to)
		: undefined
	if (hashFromCheckpoint) {
		return { hash: hashFromCheckpoint, ts: message.ts }
	}
	if (message.say === "checkpoint_saved" && message.text) {
		return { hash: message.text, ts: message.ts }
	}
	return undefined
}

export function buildWorkflowNodesFromTaskEvents(events: ReceivedTaskEvent[]): WorkflowGraphNode[] {
	const nodeMap = new Map<string, TaskTimeline>()
	const snapshots: Array<{ node: WorkflowGraphNode; order: number; timestamp: number }> = []
	let sequence = 0

	const ensureNode = (taskIdentifier?: string): TaskTimeline => {
		const id = taskIdentifier ?? UNKNOWN_TASK_ID
		let node = nodeMap.get(id)
		if (!node) {
			node = {
				id,
				parentIds: new Set<string>(),
				childIds: new Set<string>(),
				messages: [],
				stepCounter: 0,
			}
			nodeMap.set(id, node)
		}
		return node
	}

	const createSnapshot = (timeline: TaskTimeline, timestamp?: number) => {
		if (timeline.id === UNKNOWN_TASK_ID) {
			return
		}
		timeline.stepCounter += 1
		const snapshotId = `${timeline.id}#${timeline.stepCounter}`
		const completedAt = timestamp ?? timeline.completedAt ?? timeline.startedAt
		const node: WorkflowGraphNode = {
			id: snapshotId,
			taskId: timeline.id,
			stepIndex: timeline.stepCounter,
			label: timeline.label || timeline.mode || timeline.id,
			mode: timeline.mode,
			startedAt: timeline.startedAt ?? timestamp,
			completedAt,
			parentIds: Array.from(timeline.parentIds),
			childIds: Array.from(timeline.childIds),
			events: buildChatEventTrace(timeline.messages),
			checkpointHash: timeline.lastCheckpointHash,
			checkpointTs: timeline.lastCheckpointTs,
		}
		timeline.lastSnapshot = node
		snapshots.push({ node, order: sequence++, timestamp: completedAt ?? timestamp ?? 0 })
	}

	for (const event of events) {
		const taskIdentifier = event.taskIdentifier ?? (event.taskId !== undefined ? String(event.taskId) : undefined)
		const primaryNode = ensureNode(taskIdentifier)

		switch (event.eventName) {
			case RooCodeEventName.TaskStarted: {
				if (!primaryNode.startedAt) {
					primaryNode.startedAt = event.taskEventTimestamp
				}
				break
			}
			case RooCodeEventName.TaskCompleted:
			case RooCodeEventName.TaskAborted: {
				primaryNode.completedAt = event.taskEventTimestamp
				if (primaryNode.lastSnapshot && !primaryNode.lastSnapshot.completedAt) {
					primaryNode.lastSnapshot.completedAt = event.taskEventTimestamp
				}
				break
			}
			case RooCodeEventName.TaskModeSwitched: {
				const mode = ensureString(event.payload[1])
				if (!mode) {
					break
				}
				primaryNode.mode = mode
				if (!primaryNode.label) {
					primaryNode.label = mode
				}
				break
			}
			case RooCodeEventName.Message: {
				const payload = event.payload[0]
				if (isMessagePayload(payload) && payload.message) {
					primaryNode.messages.push(payload.message)
					if (!primaryNode.label && payload.message.ask) {
						primaryNode.label = payload.message.ask
					}
					const checkpointInfo = extractCheckpointHash(payload.message)
					if (checkpointInfo) {
						primaryNode.lastCheckpointHash = checkpointInfo.hash
						primaryNode.lastCheckpointTs = checkpointInfo.ts
					}
					if (payload.message.say === "checkpoint_saved") {
						break
					}
					const messageTimestamp = payload.message.ts ?? event.taskEventTimestamp
					if (!primaryNode.startedAt) {
						primaryNode.startedAt = messageTimestamp
					}
					createSnapshot(primaryNode, messageTimestamp)
				}
				break
			}
			case RooCodeEventName.TaskDelegated: {
				const parentId = ensureString(event.payload[0])
				const childId = ensureString(event.payload[1])
				if (!parentId || !childId) {
					break
				}
				const parentNode = ensureNode(parentId)
				const childNode = ensureNode(childId)
				childNode.parentIds.add(parentId)
				parentNode.childIds.add(childId)
				break
			}
			case RooCodeEventName.TaskSpawned: {
				const parentId = ensureString(event.payload[0])
				const childId = ensureString(event.payload[1])
				if (!parentId || !childId) {
					break
				}
				const parentNode = ensureNode(parentId)
				const childNode = ensureNode(childId)
				parentNode.childIds.add(childId)
				childNode.parentIds.add(parentId)
				break
			}
			case RooCodeEventName.TaskDelegationCompleted: {
				const parentId = ensureString(event.payload[0])
				const childId = ensureString(event.payload[1])
				if (!parentId || !childId) {
					break
				}
				const parentNode = ensureNode(parentId)
				const childNode = ensureNode(childId)
				childNode.completedAt = childNode.completedAt ?? event.taskEventTimestamp
				parentNode.childIds.add(childId)
				childNode.parentIds.add(parentId)
				break
			}
			case RooCodeEventName.TaskDelegationResumed: {
				const parentId = ensureString(event.payload[0])
				const childId = ensureString(event.payload[1])
				if (!parentId || !childId) {
					break
				}
				const parentNode = ensureNode(parentId)
				const childNode = ensureNode(childId)
				parentNode.childIds.add(childId)
				childNode.parentIds.add(parentId)
				break
			}
			default:
				break
		}
	}

	return snapshots
		.filter((snapshot) => !!snapshot.node && !snapshot.node.id.startsWith(UNKNOWN_TASK_ID))
		.sort((a, b) => a.order - b.order)
		.map((snapshot) => snapshot.node)
}
