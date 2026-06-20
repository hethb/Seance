import Anthropic from "@anthropic-ai/sdk";
import { config, caps } from "../config.js";
import type { Persona, Turn } from "../types.js";

// One client for the whole process. With no key, `caps.hasAnthropic` is false and
// we never touch this — the mock paths below run instead.
const client = caps.hasAnthropic
  ? new Anthropic({ apiKey: config.anthropicKey })
  : null;

// We ask Claude to return the persona as JSON and parse it. This is the portable
// approach that works on any SDK version + model.
//
// UPGRADE: newer @anthropic-ai/sdk (with messages.parse / output_config.format)
// can *force* a validated schema so you never parse by hand. Swap it in once you
// bump the SDK — the PERSONA_SHAPE below is already schema-ready.
const PERSONA_SHAPE = `{
  "objectKey":     "lowercase-hyphenated slug for this KIND of object, e.g. 'red-stapler' — same object must yield the same key so memory can find it",
  "object":        "plain identification, e.g. 'a red stapler'",
  "name":          "a characterful name for the persona",
  "tagline":       "one witty line shown under the portrait",
  "backstory":     "2-3 vivid sentences of who this object secretly is",
  "traits":        ["3-5", "personality", "adjectives"],
  "voiceModel":    "ONE Deepgram voice id that fits — pick from: aura-2-thalia-en (warm fem), aura-2-orion-en (deep masc), aura-2-luna-en (youthful fem), aura-2-arcas-en (casual masc), aura-2-zeus-en (booming masc)",
  "systemPrompt":  "a system prompt in second person that makes an AI fully embody this character in a SPOKEN conversation: voice, quirks, opinions. Tell it to keep replies to 1-3 sentences since they're spoken aloud, and to never break character",
  "portraitPrompt":"an image-gen prompt to paint this object as an anthropomorphic character portrait, matching its real colors/shape, expressive face, dramatic lighting"
}`;

/** Pull a JSON object out of a model response, tolerating ```json fences / prose. */
function extractJson<T>(text: string): T {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = fenced ? fenced[1]! : text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1);
  return JSON.parse(body) as T;
}

/**
 * Look at a captured photo and invent the persona living inside the object.
 * @param imageBase64 raw base64 (no data: prefix)
 * @param mediaType   e.g. "image/jpeg"
 */
export async function awaken(
  imageBase64: string,
  mediaType: string,
): Promise<Persona> {
  if (!client) return mockPersona();

  const message = await client.messages.create({
    model: config.anthropicModel,
    max_tokens: 2048,
    system:
      "You are the spirit medium behind Séance. You look at an everyday object and channel the larger-than-life character secretly living inside it. Be funny, specific, and a little theatrical. The character will then speak aloud to a stranger, so give it a strong, playable voice. Reply with ONLY a JSON object — no prose, no code fence.",
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: { type: "base64", media_type: mediaType as "image/jpeg", data: imageBase64 },
          },
          {
            type: "text",
            text: `Channel the character inside this object. Return JSON in exactly this shape:\n${PERSONA_SHAPE}`,
          },
        ],
      },
    ],
  });

  const text = message.content.find((b) => b.type === "text");
  if (!text || text.type !== "text") return mockPersona();
  return extractJson<Persona>(text.text);
}

/**
 * Generate the character's spoken reply. Stays in persona, uses the running
 * history (so the object remembers what was said), and is kept short for speech.
 */
export async function reply(
  persona: Persona,
  history: Turn[],
  userText: string,
  encounters: number,
): Promise<string> {
  if (!client) return mockReply(persona, userText);

  const memoryNote =
    encounters > 1
      ? `\n\nThis is encounter #${encounters} with a human — you have met before. Reference your shared history naturally if it fits.`
      : "";

  const message = await client.messages.create({
    model: config.anthropicModel,
    max_tokens: 300,
    // Short max_tokens keeps the spoken reply snappy in a live voice loop.
    // Want even lower latency? Drop this call to claude-haiku-4-5, or on a newer
    // SDK add output_config:{ effort:"low" } / enable Fast Mode (Opus 4.8 only).
    system: persona.systemPrompt + memoryNote,
    messages: [
      ...history.map((t) => ({ role: t.role, content: t.text })),
      { role: "user" as const, content: userText },
    ],
  });

  const text = message.content.find((b) => b.type === "text");
  return text && text.type === "text" ? text.text : mockReply(persona, userText);
}

// ── Mock fallbacks (no ANTHROPIC_API_KEY) ────────────────────────────────────
// These keep the whole app demoable before the Anthropic booth hands you a key.

function mockPersona(): Persona {
  return {
    objectKey: "demo-object",
    object: "a mysterious object",
    name: "Mock the Unawakened",
    tagline: "A placeholder spirit, dreaming of an API key.",
    backstory:
      "I am but a stand-in, summoned without the Anthropic key that would grant me true personality. Set ANTHROPIC_API_KEY and I shall become whatever you point the camera at.",
    traits: ["patient", "self-aware", "hopeful"],
    voiceModel: config.deepgramTtsModel,
    systemPrompt:
      "You are Mock, a friendly placeholder spirit. Keep replies to 1-2 sentences. Gently remind the user that adding ANTHROPIC_API_KEY will unlock real, object-specific personalities. Never break character.",
    portraitPrompt: "a glowing translucent ghost shaped like a question mark, friendly face",
  };
}

function mockReply(persona: Persona, userText: string): string {
  return `(${persona.name}, in mock mode) You said "${userText}". I'd have a real personality here if you set ANTHROPIC_API_KEY!`;
}
