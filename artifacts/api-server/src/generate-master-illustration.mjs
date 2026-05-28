import OpenAI from "openai";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

const PROMPT = `A detailed flat vector illustration of a friendly construction worker/master builder, upper body close-up, wearing a hard hat and work clothes with tool belt. Warm color palette with teal, blue, and golden accents. The character is surrounded by abstract tropical leaves and organic shapes. Clean modern style, smooth gradients, no outlines, professional quality. The character should look approachable and skilled, with a slight smile. Transparent or dark navy background (#0F172A). High detail on face, clothing texture, and tools.`;

async function main() {
  console.log("[generate] Starting DALL-E 3 image generation...");

  const response = await openai.images.generate({
    model: "dall-e-3",
    prompt: PROMPT,
    size: "1024x1024",
    quality: "standard",
    n: 1,
    response_format: "url",
  });

  const imageUrl = response.data[0]?.url;
  if (!imageUrl) {
    throw new Error("No image URL returned from OpenAI");
  }

  console.log("[generate] Image generated, downloading...");

  const imageResponse = await fetch(imageUrl);
  if (!imageResponse.ok) {
    throw new Error(`Failed to download image: ${imageResponse.status}`);
  }

  const buffer = Buffer.from(await imageResponse.arrayBuffer());

  const outputDir = path.join(__dirname, "../../master-landing-v2/public");
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const outputPath = path.join(outputDir, "master-illustration.png");
  fs.writeFileSync(outputPath, buffer);

  console.log(`[generate] Saved to ${outputPath} (${(buffer.length / 1024).toFixed(1)} KB)`);
}

main().catch((e) => {
  console.error("[generate] Error:", e);
  process.exit(1);
});
