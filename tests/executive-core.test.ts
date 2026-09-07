import { assertEquals } from "https://deno.land/std@0.224.0/assert/assert_equals.ts";
import { determineDecision, normalizeReasoningResult } from "../supabase/functions/_shared/executive-core.ts";

Deno.test("Executive Core normalizes reasoning into canonical objects", () => {
  const result = normalizeReasoningResult("org-1", {
    items: [{
      type: "risk",
      title: "Supplier delay",
      summary: "Material has not arrived.",
      confidence: "high",
      severity: "high",
    }],
    missing_information: [],
    contradictions: [],
  }, ["report-1"]);

  assertEquals(result.organization_id, "org-1");
  assertEquals(result.items[0].type, "risk");
  assertEquals(result.items[0].evidence_ids, ["report-1"]);
});

Deno.test("Executive Core uses deterministic escalation policy", () => {
  const reasoning = normalizeReasoningResult("org-1", {
    items: [{
      type: "issue",
      title: "Production blocked",
      summary: "A critical production issue is unresolved.",
      confidence: "high",
      severity: "critical",
      evidence_ids: ["report-2"],
    }],
  });

  const decision = determineDecision({
    organization_id: "org-1",
    reasoning,
  });

  assertEquals(decision.mode, "ESCALATE");
  assertEquals(decision.authorization_required, false);
  assertEquals(decision.evidence_ids, ["report-2"]);
});

Deno.test("Executive Core asks for missing information before recommending", () => {
  const reasoning = normalizeReasoningResult("org-1", {
    items: [],
    missing_information: ["Expected repair time"],
  });

  const decision = determineDecision({
    organization_id: "org-1",
    reasoning,
  });

  assertEquals(decision.mode, "ASK");
});
