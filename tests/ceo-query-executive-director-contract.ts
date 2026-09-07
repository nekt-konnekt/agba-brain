const source = await Deno.readTextFile("supabase/functions/ceo-query/index.ts");

const required = [
  "CONVERSATIONAL EXECUTIVE DIRECTOR CONTRACT",
  "For broad questions such as “what is on our plate?", “what matters today?", or “what needs attention?", synthesize and prioritize",
  "Connect the current situation to what happened before",
  "Prefer natural paragraphs over rigid section labels",
  "Do not dump every metric or historical item merely because it is available",
  "When asked what Agba can “take off” or “handle”, do not infer execution authority",
  "Never claim an action is being executed, activated, contacted, scheduled, sent, or monitored",
  "A conversational question about how Agba would do something is not permission to do it.",
  "governance_policy:\"owner_authority_separation\"",
];

const forbidden = [
  "I’ll activate the open action",
  "I can take care of coordinating the shipment",
  "No additional actions are required beyond the existing open items.",
];

for (const phrase of required) {
  if (!source.includes(phrase)) throw new Error(`Missing executive-director contract: ${phrase}`);
}
for (const phrase of forbidden) {
  if (source.includes(phrase)) throw new Error(`Forbidden conversational behavior remains in source: ${phrase}`);
}

console.log("CEO QUERY EXECUTIVE DIRECTOR CONTRACT: PASS");
