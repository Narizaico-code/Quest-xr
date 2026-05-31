import "dotenv/config";
import { runResearchQuery } from "../src/services/geminiProService.js";

async function run() {
  const query = process.argv.slice(2).join(" ") || "hola mundo";
  console.log(`Query: "${query}"`);
  const res = await runResearchQuery(query);
  console.log(JSON.stringify(res, null, 2));
}

run().catch(console.error);
