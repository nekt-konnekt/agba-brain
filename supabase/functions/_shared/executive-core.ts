/**
 * Agba Executive Core V2.
 *
 * This is the migration boundary between today's services and the target
 * Executive Director loop. It deliberately contains no model call and no
 * transport logic. It converts existing reasoning output into canonical
 * executive objects and applies deterministic decision policy.
 */

import type {
  AgbaConfidence,
  Decision,
  DecisionMode,
  ReasoningItem,
  ReasoningResult,
} from "./executive-contracts.ts";

export interface ExecutiveDecisionInput {
  organization_id: string;
  reasoning: ReasoningResult;
  evidence_ids?: string[];
  authorization_required?: boolean;
  authorized_by?: string;
}

export function normalizeReasoningResult(
  organizationId: string,
  raw: unknown,
  evidenceIds: string[] = [],
): ReasoningResult {
  const value = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
  const rawItems = Array.isArray(value.items) ? value.items : [value];

  const items: ReasoningItem[] = rawItems.map((item) => {
    const source = item && typeof item === "object" ? item as Record<string, unknown> : {};
    const type = String(source.type ?? "observation").trim().toLowerCase();
    const normalizedType: ReasoningItem["type"] =
      type === "issue" || type === "risk" || type === "opportunity" ||
      type === "trend" || type === "hypothesis" || type === "missing_information" ||
      type === "recommendation" || type === "observation"
        ? type
        : "observation";

    const confidenceValue = String(source.confidence ?? "medium").toLowerCase();
    const confidence: AgbaConfidence =
      confidenceValue === "high" || confidenceValue === "low" ? confidenceValue : "medium";

    const evidence = Array.isArray(source.evidence_ids)
      ? source.evidence_ids.map(String)
      : evidenceIds;

    return {
      type: normalizedType,
      title: String(source.title ?? "Agba observation").trim(),
      summary: String(source.summary ?? source.text ?? "").trim(),
      confidence,
      severity: normalizeSeverity(source.severity),
      evidence_ids: evidence,
    };
  });

  return {
    organization_id: organizationId,
    evaluated_at: new Date().toISOString(),
    items,
    missing_information: Array.isArray(value.missing_information)
      ? value.missing_information.map(String)
      : [],
    contradictions: Array.isArray(value.contradictions)
      ? value.contradictions.map(String)
      : [],
  };
}

/**
 * Deterministic executive policy. The model may explain a situation, but it
 * does not get to decide authorization or whether an external commitment is
 * allowed. Those are policy decisions owned by Agba's application layer.
 */
export function determineDecision(input: ExecutiveDecisionInput): Decision {
  const { reasoning } = input;
  const material = reasoning.items.find((item) =>
    item.type === "issue" || item.type === "risk" || item.type === "opportunity" || item.type === "recommendation"
  );

  let mode: DecisionMode = "NO_ACTION";
  if (reasoning.missing_information.length > 0) mode = "ASK";
  else if (material?.severity === "critical" || material?.severity === "high") mode = "ESCALATE";
  else if (material) mode = "RECOMMEND";
  else mode = "MONITOR";

  const evidenceIds = Array.from(new Set([
    ...(input.evidence_ids ?? []),
    ...(material?.evidence_ids ?? []),
  ]));

  return {
    id: crypto.randomUUID(),
    organization_id: input.organization_id,
    decided_at: new Date().toISOString(),
    mode,
    rationale: material
      ? `${material.title}: ${material.summary}`
      : reasoning.missing_information.length > 0
        ? "Additional information is required before a reliable executive conclusion can be made."
        : "No material issue or opportunity requires immediate intervention from the supplied evidence.",
    confidence: material?.confidence ?? "medium",
    evidence_ids: evidenceIds,
    reasoning_item_ids: [],
    authorization_required: input.authorization_required ?? mode === "ACT",
    authorized_by: input.authorized_by,
  };
}

function normalizeSeverity(value: unknown): ReasoningItem["severity"] {
  if (typeof value !== "string") return undefined;
  const severity = value.trim().toLowerCase();
  if (["low", "medium", "high", "critical"].includes(severity)) {
    return severity as ReasoningItem["severity"];
  }
  return undefined;
}
