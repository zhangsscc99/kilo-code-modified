import type { RooCodeEventName } from "@roo-code/types"

export interface ReceivedTaskEvent {
	eventName: RooCodeEventName
	payload: unknown[]
	taskId?: number
	taskIdentifier?: string
	taskEventTimestamp: number
}
