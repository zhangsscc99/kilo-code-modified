import { z } from "zod"

const eventSummarySchema = z.object({
	id: z.string(),
	name: z.string().optional(),
	action: z.string().optional(),
	status: z.string().optional(),
	outcome: z.enum(["success", "failure"]).optional(),
	kind: z.enum(["invocation", "result", "other"]).optional(),
	detail: z.string().optional(),
	tokensIn: z.number().optional(),
	tokensOut: z.number().optional(),
	exitCode: z.number().optional(),
	timestamp: z.number().optional(),
})

const agentSummarySchema = z.object({
	id: z.string(),
	label: z.string(),
	text: z.string().optional(),
	timestamp: z.number().optional(),
})

const userSummarySchema = z.object({
	id: z.string(),
	label: z.string(),
	text: z.string().optional(),
	timestamp: z.number().optional(),
})

const statsSchema = z.object({
	toolCount: z.number(),
	toolSuccessCount: z.number(),
	toolFailureCount: z.number(),
	hookCount: z.number(),
	agentCount: z.number(),
	subagentCount: z.number(),
	totalTokensIn: z.number(),
	totalTokensOut: z.number(),
	durationMs: z.number().optional(),
})

export const workflowNodeAnalysisSummarySchema = z.object({
	stats: statsSchema,
	toolEvents: z.array(eventSummarySchema),
	hookEvents: z.array(eventSummarySchema),
	userEvents: z.array(userSummarySchema),
	agentEvents: z.array(agentSummarySchema),
	subagentEvents: z.array(agentSummarySchema),
	isEmpty: z.boolean(),
})

export type WorkflowNodeAnalysisSummary = z.infer<typeof workflowNodeAnalysisSummarySchema>
export type WorkflowNodeAnalysisEventSummary = z.infer<typeof eventSummarySchema>
export type WorkflowNodeAnalysisAgentSummary = z.infer<typeof agentSummarySchema>
export type WorkflowNodeAnalysisUserSummary = z.infer<typeof userSummarySchema>

export const workflowNodeAnalysisRequestPayloadSchema = z.object({
	nodeId: z.string(),
	taskId: z.string(),
	branchId: z.string().optional(),
	label: z.string().optional(),
	mode: z.string().optional(),
	startedAt: z.number().optional(),
	completedAt: z.number().optional(),
	checkpointHash: z.string().optional(),
	summary: workflowNodeAnalysisSummarySchema,
	userMessage: z.string().optional(),
})

export type WorkflowNodeAnalysisRequestPayload = z.infer<typeof workflowNodeAnalysisRequestPayloadSchema>

export const workflowNodeAnalysisResultPayloadSchema = z.object({
	nodeId: z.string(),
	taskId: z.string(),
	status: z.enum(["success", "error"]),
	analysis: z.string().optional(),
	suggestions: z.array(z.string()).optional(),
	generatedAt: z.number(),
	error: z.string().optional(),
})

export type WorkflowNodeAnalysisResultPayload = z.infer<typeof workflowNodeAnalysisResultPayloadSchema>

// Backwards-compatible aliases for webview utilities
export type EnhancedWorkflowEventsData = WorkflowNodeAnalysisSummary
export type EnhancedEventSummary = WorkflowNodeAnalysisEventSummary
export type EnhancedAgentSummary = WorkflowNodeAnalysisAgentSummary
export type EnhancedUserSummary = WorkflowNodeAnalysisUserSummary
