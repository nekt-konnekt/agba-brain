const source = await Deno.readTextFile("supabase/functions/telegram-gateway/index.ts");

const required = [
  "getCanonicalExecutiveState",
  "functions/v1/executive-memory",
  "if (text === \"/briefing\")",
  "canonical.executive_state",
  "state.what_changed",
  "state.what_needs_attention",
  "state.decisions",
  "state.actions",
  "state.outcomes",
  "state.unresolved",
  "canonical.transitions",
];

for (const marker of required) {
  if (!source.includes(marker)) throw new Error(`Missing Telegram briefing canonical-state marker: ${marker}`);
}

const briefingStart = source.indexOf('if (text === "/briefing")');
const briefingEnd = source.indexOf('if (!text) return json({ ok: true });', briefingStart);
if (briefingStart < 0 || briefingEnd < 0 || briefingEnd <= briefingStart) {
  throw new Error("Could not isolate Telegram briefing handler");
}

const briefingBlock = source.slice(briefingStart, briefingEnd);
if (briefingBlock.includes('.from("agba_state_items")')) {
  throw new Error("Telegram briefing still reconstructs state directly from agba_state_items");
}
if (!briefingBlock.includes("getCanonicalExecutiveState")) {
  throw new Error("Telegram briefing does not use canonical executive memory");
}

console.log("TELEGRAM BRIEFING CANONICAL STATE: PASS");
