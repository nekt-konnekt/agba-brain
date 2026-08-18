import { init } from "npm:@heyputer/puter.js/src/init.cjs";

const token = Deno.env.get("PUTER_AUTH_TOKEN");
if (!token) throw new Error("Missing PUTER_AUTH_TOKEN");

const puter = init(token);

try {
  const response = await puter.ai.chat(
    "Reply with exactly AGBA_PUTER_OK",
    { model: "gpt-5.4-nano" },
  );

  console.log("Puter native smoke: SUCCESS");
  console.log(JSON.stringify(response));
} catch (error) {
  console.error("Puter native smoke: FAILED");
  console.error(error instanceof Error ? error.message : String(error));
  Deno.exit(1);
}
