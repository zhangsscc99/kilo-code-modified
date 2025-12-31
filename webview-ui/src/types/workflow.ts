import type { WorkflowNodeRestorePayload } from "@roo/WebviewMessage"

export type WorkflowNodeRestoreRequest = WorkflowNodeRestorePayload

export interface WorkflowRestoreState {
	pendingSnapshotId?: string
	lastSnapshotId?: string
	status?: "success" | "error"
	error?: string
}
