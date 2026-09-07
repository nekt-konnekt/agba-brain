/**
 * Agba Executive Loop V2 domain contracts.
 *
 * These types define boundaries between Observe, Memory, Think, Decide,
 * Act, and Outcome. They are intentionally transport-agnostic so Telegram,
 * web, email, MCP, and future connectors can share the same core contracts.
 */

export type AgbaConfidence = "high" | "medium" | "low";

export type DecisionMode =
  | "NO_ACTION"
  | "MONITOR"
  | "ASK"
  | "RECOMMEND"
  | "ESCALATE"
  | "ACT";

export type ObservationSource =
  | "telegram"
  | "email"
  | "calendar"
  | "crm"
  | "document"
  | "mcp"
  | "web"
  | "internal";

export type ReasoningObjectType =
  | "observation"
  | "trend"
  | "issue"
  | "risk"
  | "opportunity"
  | "hypothesis"
  | "missing_information"
  | "recommendation";

export interface Observation<TPayload = unknown> {
  id: string;
  organization_id: string;
  source: ObservationSource;
  source_event_id?: string;
  actor_id?: string;
  occurred_at: string;
  observed_at: string;
  type: string;
  payload: TPayload;
  idempotency_key: string;
  evidence_ids: string[];
  confidence: AgbaConfidence;
}

export interface Evidence {
  id: string;
  organization_id: string;
  source: ObservationSource | "database" | "user";
  source_reference?: string;
  occurred_at?: string;
  content: unknown;
  confidence: AgbaConfidence;
  immutable: boolean;
}

export interface BusinessContext {
  organization_id: string;
  as_of: string;
  facts: unknown[];
  current_state: unknown[];
  observations: Observation[];
  relevant_issues: unknown[];
  recent_decisions: unknown[];
  open_actions: unknown[];
  evidence: Evidence[];
  constraints: unknown[];
}

export interface ReasoningItem {
  type: ReasoningObjectType;
  title: string;
  summary: string;
  confidence: AgbaConfidence;
  severity?: "low" | "medium" | "high" | "critical";
  evidence_ids: string[];
}

export interface ReasoningResult {
  organization_id: string;
  evaluated_at: string;
  items: ReasoningItem[];
  missing_information: string[];
  contradictions: string[];
}

export interface Decision {
  id: string;
  organization_id: string;
  decided_at: string;
  mode: DecisionMode;
  rationale: string;
  confidence: AgbaConfidence;
  evidence_ids: string[];
  reasoning_item_ids: string[];
  authorization_required: boolean;
  authorized_by?: string;
}

export interface ActionIntent {
  id: string;
  organization_id: string;
  decision_id: string;
  action_type: string;
  target: unknown;
  parameters: unknown;
  authorization_required: boolean;
  authorized_by?: string;
  idempotency_key: string;
}

export interface ActionExecution {
  id: string;
  action_intent_id: string;
  status: "queued" | "running" | "succeeded" | "failed";
  started_at?: string;
  completed_at?: string;
  provider?: string;
  external_reference?: string;
  result?: unknown;
  error?: string;
}

export interface Outcome {
  id: string;
  organization_id: string;
  action_intent_id: string;
  execution_id?: string;
  status: "unverified" | "confirmed" | "failed" | "partial";
  observed_at: string;
  evidence_ids: string[];
  summary: string;
}

export interface ExecutiveEvaluation {
  context: BusinessContext;
  reasoning: ReasoningResult;
  decision?: Decision;
  action_intents: ActionIntent[];
}
