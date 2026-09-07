const source = await Deno.readTextFile("supabase/functions/daily-briefing-v2/index.ts");

const required = [
  'functions/v1/executive-memory',
  'canonical?.executive_state',
  'executiveState.what_changed',
  'executiveState.what_needs_attention',
  'executiveState.decisions',
  'executiveState.actions',
  'executiveState.outcomes',
  'executiveState.unresolved',
  'canonical.transitions',
];

for (const marker of required) {
  if (!source.includes(marker)) throw new Error(`Missing canonical Morning Brief marker: ${marker}`);
}

console.log("MORNING BRIEF CANONICAL STATE: PASS");
