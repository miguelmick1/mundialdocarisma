import { config } from "dotenv";
config({ path: ".env.local" });

async function main() {
  const { linkAllWorldCupFixtures } = await import("../src/lib/live-score/sync");
  const result = await linkAllWorldCupFixtures();
  console.log(`API-Football retornou ${result.availableFixtures} jogos.`);
  console.log(`${result.linkedMatches} jogos locais foram vinculados.`);
  console.log("Cota diária restante:", result.quota.dailyRemaining ?? "não informada");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
