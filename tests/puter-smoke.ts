const token = Deno.env.get("PUTER_AUTH_TOKEN");
if (!token) throw new Error("Missing PUTER_AUTH_TOKEN");

const response = await fetch("https://api.puter.com/puterai/openai/v1/chat/completions", {
  method: "POST",
  headers: {
    "Authorization": `Bearer ${token}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    model: "gpt-5.4-nano",
    messages: [{ role: "user", content: "Reply with exactly AGBA_PUTER_OK" }],
  }),
});

const body = await response.text();
console.log(`Puter smoke HTTP ${response.status}`);
console.log(body);

if (!response.ok) {
  throw new Error(`Puter smoke failed with HTTP ${response.status}`);
}

const parsed = JSON.parse(body);
const content = parsed?.choices?.[0]?.message?.content;
if (!content) throw new Error("Puter smoke response missing choices[0].message.content");

console.log(`Puter smoke content: ${content}`);
