// prueba-azure.js
import "dotenv/config";
import { classifyIntentAzure } from "../src/services/azureFlashLiteRouter.js";

async function run() {
  // Use prompt from CLI args or default
  const prompt = process.argv.slice(2).join(" ") || "haz aparecer una mesa de madera";
  console.log(`Prompt: "${prompt}"`);
  const res = await classifyIntentAzure(prompt);
  console.log(JSON.stringify(res, null, 2));
}

run().catch(console.error);