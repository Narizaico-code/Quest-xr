import OpenAI from "openai";

const endpoint = "https://pruebavscode-resource.services.ai.azure.com/openai/v1";
const deploymentName = "gpt-5.4-mini";
const apiKey = "<your-api-key>";

const openai = new OpenAI({
    baseURL: endpoint,
    apiKey: apiKey
});

async function main() {
  const completion = await openai.chat.completions.create({
    messages: [{ role: "system", content: "You are a helpful assistant." }],
    model: deploymentName,
    store: true,
  });

  console.log(completion.choices[0]);
}

main();