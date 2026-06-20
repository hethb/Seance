// Shared types for Séance. The Persona is the spine of the whole app:
// Claude invents it from a photo, the image generator paints it, Deepgram voices
// it, and Redis remembers it.

export interface Persona {
  /** Stable id derived from the object Claude sees (e.g. "stapler-red-stout"). */
  objectKey: string;
  /** The object as identified, plain words: "a red stapler". */
  object: string;
  /** Character name, e.g. "Klamp the Stapler". */
  name: string;
  /** One-line hook shown in the UI under the portrait. */
  tagline: string;
  /** 2–3 sentence backstory used to seed the conversation + portrait prompt. */
  backstory: string;
  /** Adjectives that define the voice & attitude, e.g. ["bitter", "regal"]. */
  traits: string[];
  /** A Deepgram TTS voice id that fits the character. */
  voiceModel: string;
  /** The system prompt that makes Claude *stay in character* while chatting. */
  systemPrompt: string;
  /** Prompt handed to the image generator to paint the character portrait. */
  portraitPrompt: string;
  /** False when Claude couldn't confidently identify the object — triggers mystery portrait. */
  objectRecognized: boolean;
}

/** One turn of dialogue, stored in Redis so the object has a memory. */
export interface Turn {
  role: "user" | "assistant";
  text: string;
}

/** Everything we persist per awakened object. */
export interface SessionState {
  persona: Persona;
  portraitUrl: string;
  history: Turn[];
  /** How many separate times a human has talked to this object. */
  encounters: number;
}
