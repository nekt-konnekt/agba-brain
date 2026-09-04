import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export type ActionMutation = {
  operation: "create" | "status" | "assign" | "deadline" | "priority" | "metadata";
  actionId?: string | null;
  organizationId: string;
  actorId?: string | null;
  description?: string | null;
  ownerName?: string | null;
  deadline?: string | null;
  status?: "open" | "in_progress" | "done" | "cancelled" | null;
  priority?: "low" | "medium" | "high" | null;
  metadata?: Record<string, unknown>;
  sourceCeoQueryId?: string | null;
  sourceStateItemId?: string | null;
};

function normalizeOwnerName(value: string | null | undefined) {
  const v = String(value ?? "").trim().replace(/^for\s+/i, "");
  return v || null;
}

export async function mutateAction(db: SupabaseClient, input: ActionMutation) {
  const { data, error } = await db.rpc("agba_mutate_action", {
    p_operation: input.operation,
    p_action_id: input.actionId ?? null,
    p_organization_id: input.organizationId,
    p_created_by: input.actorId ?? null,
    p_description: input.description ?? null,
    p_owner_name: normalizeOwnerName(input.ownerName),
    p_deadline: input.deadline ?? null,
    p_status: input.status ?? null,
    p_priority: input.priority ?? null,
    p_metadata: input.metadata ?? {},
    p_source_ceo_query_id: input.sourceCeoQueryId ?? null,
    p_source_state_item_id: input.sourceStateItemId ?? null,
  });

  if (error) throw new Error(`action_mutation_failed:${error.message}`);
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) throw new Error("action_mutation_empty_result");
  return row;
}

export const createAction = (db: SupabaseClient, input: Omit<ActionMutation, "operation">) =>
  mutateAction(db, { ...input, operation: "create" });

export const updateActionStatus = (db: SupabaseClient, input: Omit<ActionMutation, "operation"> & { actionId: string; status: ActionMutation["status"] }) =>
  mutateAction(db, { ...input, operation: "status" });

export const assignAction = (db: SupabaseClient, input: Omit<ActionMutation, "operation"> & { actionId: string; ownerName: string | null }) =>
  mutateAction(db, { ...input, operation: "assign" });

export const setActionDeadline = (db: SupabaseClient, input: Omit<ActionMutation, "operation"> & { actionId: string; deadline: string | null }) =>
  mutateAction(db, { ...input, operation: "deadline" });

export const setActionPriority = (db: SupabaseClient, input: Omit<ActionMutation, "operation"> & { actionId: string; priority: "low" | "medium" | "high" }) =>
  mutateAction(db, { ...input, operation: "priority" });
