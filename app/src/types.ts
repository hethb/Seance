// Client mirror of the server's domain types (see ../../src/types.ts on the
// server). The Persona is the spine: Claude invents it from the photo, the image
// hop paints it, Deepgram voices it, Redis remembers it.

export interface Persona {
  /** Stable id for the object Claude sees (e.g. "stapler-red-stout"). */
  objectKey: string;
  /** The object as identified, plain words: "a red stapler". */
  object: string;
  /** Character name, e.g. "Klamp the Stapler". */
  name: string;
  /** One-line hook shown under the portrait. */
  tagline: string;
  /** The character's actual first spoken words (falls back to backstory if absent). */
  openingLine?: string;
  /** 2–3 sentence backstory shown under the portrait. */
  backstory: string;
  /** Adjectives that define voice & attitude, e.g. ["bitter", "regal"]. */
  traits: string[];
  /** Deepgram TTS voice id that fits the character. */
  voiceModel: string;
  /** System prompt that keeps Claude in character (server-side only, but echoed). */
  systemPrompt: string;
  /** Prompt used by the image hop to paint the portrait. */
  portraitPrompt: string;
}

/** One stored turn of dialogue (mirrors the server's Turn). */
export interface Turn {
  role: "user" | "assistant";
  text: string;
}

/** Response from POST /api/awaken. */
export interface AwakenResponse {
  persona: Persona;
  /** A data: URL (mock) or http(s)/relative URL to the portrait image. */
  portraitUrl: string;
  /** How many separate times this object has been awakened. */
  encounters: number;
  /** True when Redis already knew this object — "it remembers you". */
  returning: boolean;
  /** Prior conversation turns for a returning object (empty on first awaken). */
  history?: Turn[];
}

/** Response from POST /api/converse. */
export interface ConverseResponse {
  /** What the human said (typed, or transcribed from audio). */
  userText: string;
  /** The character's in-persona reply. */
  replyText: string;
  /** base64 mp3 of the spoken reply when Deepgram is live, else null. */
  audio: string | null;
  voiceModel: string;
}
