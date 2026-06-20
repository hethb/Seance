/**
 * Smoke test for Adobe Firefly image generation.
 * Run: npx tsx scripts/test-firefly.ts
 * Requires ADOBE_FIREFLY_CLIENT_ID and ADOBE_FIREFLY_CLIENT_SECRET in .env.local
 */
import { config as dotenvLoad } from "dotenv";
dotenvLoad({ path: ".env.local" });
dotenvLoad();

const clientId = process.env.ADOBE_FIREFLY_CLIENT_ID ?? "";
const clientSecret = process.env.ADOBE_FIREFLY_CLIENT_SECRET ?? "";

if (!clientId || !clientSecret) {
  console.error("Missing ADOBE_FIREFLY_CLIENT_ID or ADOBE_FIREFLY_CLIENT_SECRET in .env.local");
  process.exit(1);
}

const TEST_PROMPTS = [
  "a grumpy red stapler as an anthropomorphic character portrait, expressive face, dramatic lighting, digital art",
  "a dramatic coffee mug as a wise ancient wizard character portrait, steam rising like magic, fantasy illustration",
  "a pair of headphones as an aloof teenage character portrait, cool attitude, neon colors, character design",
];

async function getToken(): Promise<string> {
  const res = await fetch("https://ims-na1.adobelogin.com/ims/token/v3", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: clientId,
      client_secret: clientSecret,
      scope: "openid,AdobeID,session,additional_info,read_organizations,firefly_enterprise,firefly_api,creative_sdk",
    }),
  });
  if (!res.ok) throw new Error(`Auth failed ${res.status}: ${await res.text()}`);
  const { access_token } = (await res.json()) as { access_token: string };
  console.log("✓ Got Firefly access token");
  return access_token;
}

async function generate(token: string, prompt: string): Promise<string> {
  const res = await fetch("https://firefly-api.adobe.io/v3/images/generate", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "x-api-key": clientId,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      prompt,
      numVariations: 1,
      size: { width: 1024, height: 1024 },
      contentClass: "art",
    }),
  });
  if (!res.ok) throw new Error(`Generate failed ${res.status}: ${await res.text()}`);
  const data = (await res.json()) as { outputs?: { image?: { url?: string } }[] };
  const url = data.outputs?.[0]?.image?.url;
  if (!url) throw new Error("No image URL in response");
  return url;
}

async function main() {
  console.log("Testing Adobe Firefly...\n");
  const token = await getToken();

  for (const prompt of TEST_PROMPTS) {
    const label = prompt.slice(0, 50) + "...";
    process.stdout.write(`Generating: ${label}\n  → `);
    const start = Date.now();
    try {
      const url = await generate(token, prompt);
      console.log(`✓ ${Date.now() - start}ms — ${url}`);
    } catch (err) {
      console.log(`✗ ${String(err)}`);
    }
  }
}

main().catch(console.error);
