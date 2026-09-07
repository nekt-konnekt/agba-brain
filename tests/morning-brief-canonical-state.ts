// Regression contract for the Morning Brief implementation.
// The production function must call executive-memory and feed its canonical
// executive_state/transitions into the briefing generation path.

const source = await (await fetch("https://raw.githubusercontent.com/nekt-konnekt/agba-brain/executive-state/morning-brief-v2/supabase/functions/daily-briefing-v2/index.ts")).text();

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
