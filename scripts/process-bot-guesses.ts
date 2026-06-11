import { config } from "dotenv";
config({ path: ".env.local" });

async function main() {
  const { processAutomaticBotGuesses } = await import("../src/lib/bots/automation");
  const summary = await processAutomaticBotGuesses({ force: true });
  console.log(JSON.stringify(summary, null, 2));
  if (summary.errors.length) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
