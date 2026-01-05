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
	snapshotTs?: number
	parentIds: string[]
	childIds: string[]
	events: ChatTraceEvent[]
	checkpoint?: { hash: string; ts?: number }
	supportsCheckpointRestore: boolean
	branchId: string
	branchParentSnapshotId?: string | null
	previousSnapshotId?: string
}

export interface WorkflowBranchMetadata {
	id: string
	label: string
	parentSnapshotId: string | null
	parentBranchId: string | null
	createdAt: number
}

export const DEFAULT_WORKFLOW_BRANCH_ID = "branch-main"

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
	buffer: ClineMessage[]
	bufferStart?: number
	stepCounter: number
	lastSnapshot?: WorkflowGraphNode
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

export function getCheckpointHash(message?: ClineMessage) {
	if (!message) {
		return undefined
	}
	const checkpointHash = (message as ClineMessage & { checkpoint?: { to?: string } }).checkpoint?.to
	if (typeof checkpointHash === "string" && checkpointHash.length > 0) {
		return checkpointHash
	}
	if (message.say === "checkpoint_saved" && typeof message.text === "string") {
		return message.text
	}
	return undefined
}

export function buildWorkflowNodesFromTaskEvents(
	events: ReceivedTaskEvent[],
	options?: { branchMetadata?: Record<string, WorkflowBranchMetadata> },
): WorkflowGraphNode[] {
	const nodeMap = new Map<string, TaskTimeline>()
	const snapshots: Array<{ node: WorkflowGraphNode; order: number; timestamp: number }> = []
	let sequence = 0
	const branchLastSnapshotId = new Map<string, string | undefined>()

	const ensureNode = (taskIdentifier?: string): TaskTimeline => {
		const id = taskIdentifier ?? UNKNOWN_TASK_ID
		let node = nodeMap.get(id)
		if (!node) {
			node = {
				id,
				parentIds: new Set<string>(),
				childIds: new Set<string>(),
				messages: [],
				buffer: [],
				stepCounter: 0,
			}
			nodeMap.set(id, node)
		}
		return node
	}

	const createSnapshot = (timeline: TaskTimeline, checkpointMessage: ClineMessage, branchId: string) => {
		if (timeline.id === UNKNOWN_TASK_ID) {
			return
		}
		timeline.stepCounter += 1
		const snapshotId = `${timeline.id}#${timeline.stepCounter}`
		const snapshotTimestamp = checkpointMessage.ts
		const checkpointHash = getCheckpointHash(checkpointMessage)
		const normalizedBranchId = branchId || DEFAULT_WORKFLOW_BRANCH_ID
		const branchInfo = options?.branchMetadata?.[normalizedBranchId]
		const previousSnapshotId = branchLastSnapshotId.get(normalizedBranchId) ?? branchInfo?.parentSnapshotId ?? undefined
		const isFirstInBranch = !branchLastSnapshotId.get(normalizedBranchId)
		const branchParentSnapshotId = isFirstInBranch ? branchInfo?.parentSnapshotId ?? null : undefined
		const node: WorkflowGraphNode = {
			id: snapshotId,
			taskId: timeline.id,
			stepIndex: timeline.stepCounter,
			label: timeline.label || timeline.mode || timeline.id,
			mode: timeline.mode,
			startedAt: timeline.bufferStart ?? checkpointMessage.ts,
			completedAt: checkpointMessage.ts,
			snapshotTs: snapshotTimestamp,
			parentIds: Array.from(timeline.parentIds),
			childIds: Array.from(timeline.childIds),
			events: buildChatEventTrace(timeline.buffer),
			checkpoint: checkpointHash ? { hash: checkpointHash, ts: checkpointMessage.ts } : undefined,
			supportsCheckpointRestore: Boolean(checkpointHash),
			branchId: normalizedBranchId,
			branchParentSnapshotId,
			previousSnapshotId,
		}
		timeline.lastSnapshot = node
		snapshots.push({ node, order: sequence++, timestamp: snapshotTimestamp ?? 0 })
		timeline.buffer = []
		timeline.bufferStart = undefined
		branchLastSnapshotId.set(normalizedBranchId, snapshotId)
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
					const clineMessage = payload.message
					primaryNode.messages.push(clineMessage)
					primaryNode.buffer.push(clineMessage)
					if (!primaryNode.bufferStart || (clineMessage.ts && clineMessage.ts < primaryNode.bufferStart)) {
						primaryNode.bufferStart = clineMessage.ts ?? event.taskEventTimestamp
					}
					if (!primaryNode.label && clineMessage.ask) {
						primaryNode.label = clineMessage.ask
					}
					const checkpointHash = getCheckpointHash(clineMessage)
					if (checkpointHash) {
						const branchId = event.branchId ?? DEFAULT_WORKFLOW_BRANCH_ID
						createSnapshot(primaryNode, clineMessage, branchId)
					}
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
