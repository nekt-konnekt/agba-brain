const source = await Deno.readTextFile("supabase/functions/telegram-gateway/index.ts");

const required = [
  "CONVERSATIONAL EXECUTIVE DIRECTOR CONTRACT",
  "synthesize and prioritize",
  "Connect the current situation to what happened before",
  "Prefer natural paragraphs over rigid section labels",
  "OWNER / AUTHORITY SEPARATION",
  "Never claim ownership of an unassigned human action",
  "do not infer execution authority",
  "Never claim that Agba has contacted a customer, supplier, staff member, logistics partner, scheduled something, sent something, activated an action, or is monitoring an external process",
  "A conversational question about how Agba would do something is not permission to do it.",
  "reasoning_path: \"executive_director_contract\"",
];

for (const phrase of required) {
  if (!source.includes(phrase)) throw new Error(`missing Telegram Executive Director contract phrase: ${phrase}`);
}

const forbidden = [
  "I’ll activate the open action",
  "I can take care of coordinating the shipment",
  "No additional actions are required beyond the existing open items.",
  "You are Agba, the operating brain of a company. Answer the CEO directly using only confirmed company evidence. Never invent facts. Be concise and practical. Use Telegram-friendly Markdown.",
];

for (const phrase of forbidden) {
  if (source.includes(phrase)) throw new Error(`forbidden legacy Telegram CEO prompt/output remains: ${phrase}`);
}

console.log("TELEGRAM EXECUTIVE DIRECTOR CONTRACT: PASS");
