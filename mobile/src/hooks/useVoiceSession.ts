import { useCallback, useRef, useState } from "react";
import { configure, useDeepgramVoiceAgent } from "react-native-deepgram";
import { fetchVoiceToken, postTurn } from "../api";
import type { Persona, Turn } from "../types";

// LLM model for the voice loop — Haiku is fast enough for real-time; persona quality
// comes from systemPrompt, not model size.
const THINK_MODEL = "claude-haiku-4-5-20251001";

export type VoiceStatus =
  | "idle"
  | "connecting"
  | "ready"
  | "user-speaking"
  | "agent-speaking"
  | "error";

export interface VoiceSession {
  status: VoiceStatus;
  transcript: Turn[];
  error: string | null;
  connect: () => Promise<void>;
  disconnect: () => void;
}

/**
 * Wraps useDeepgramVoiceAgent with Séance-specific logic:
 * - Fetches a short-lived token from the backend before connecting
 * - Configures the agent with the object's persona (systemPrompt, voice, greeting)
 * - Seeds the LLM prompt with the last 3 exchanges so the object remembers prior chats
 * - Persists each ConversationText turn to Redis via POST /api/turn
 *
 * Usage (in Task 3's conversation screen):
 *   const { status, transcript, connect, disconnect } = useVoiceSession(persona, history);
 *   useEffect(() => { connect(); return () => disconnect(); }, []);
 */
export function useVoiceSession(
  persona: Persona,
  priorHistory: Turn[],
): VoiceSession {
  const [status, setStatus] = useState<VoiceStatus>("idle");
  const [transcript, setTranscript] = useState<Turn[]>(priorHistory);
  const [error, setError] = useState<string | null>(null);
  // Track whether we've configured the global Deepgram client with a fresh token.
  const configuredRef = useRef(false);

  // Seed the system prompt with the last 3 exchanges so the object remembers.
  const buildThinkPrompt = useCallback((): string => {
    const recent = priorHistory.slice(-6);
    if (recent.length === 0) return persona.systemPrompt;
    const recap = recent
      .map((t) => `${t.role === "user" ? "Human" : persona.name}: ${t.text}`)
      .join("\n");
    return `${persona.systemPrompt}\n\nPrevious conversation (remember this):\n${recap}`;
  }, [persona, priorHistory]);

  const agent = useDeepgramVoiceAgent({
    autoStartMicrophone: true,
    autoPlayAudio: true,
    trackState: true,
    trackConversation: false, // we own the transcript
    trackAgentStatus: true,

    defaultSettings: {
      audio: {
        input: { encoding: "linear16", sample_rate: 24000 },
        output: { encoding: "linear16", sample_rate: 24000, container: "none" },
      },
      agent: {
        listen: {
          provider: { type: "deepgram", model: "nova-3", smart_format: true },
        },
        think: {
          provider: {
            type: "anthropic",
            model: THINK_MODEL,
            temperature: 0.9,
          },
          prompt: buildThinkPrompt(),
        },
        speak: {
          provider: { type: "deepgram", model: persona.voiceModel },
        },
        // The backstory becomes the agent's opening line — it plays as the first
        // TTS audio and fires as a ConversationText event.
        greeting: persona.backstory,
      },
    },

    onConnect: () => setStatus("ready"),
    onClose: () => {
      setStatus("idle");
      configuredRef.current = false;
    },
    onError: (err) => {
      setError(String(err));
      setStatus("error");
    },
    onServerError: ({ code, description }) => {
      setError(`${code}: ${description}`);
      setStatus("error");
    },
    onUserStartedSpeaking: () => setStatus("user-speaking"),
    onAgentStartedSpeaking: () => setStatus("agent-speaking"),
    onAgentAudioDone: () => setStatus("ready"),

    onConversationText: ({ role, content }) => {
      const turn: Turn = {
        role: role === "assistant" || role === "agent" ? "assistant" : "user",
        text: content,
      };
      setTranscript((prev) => [...prev, turn]);
      // Fire-and-forget: persist to Redis so the object remembers this conversation.
      postTurn(persona.objectKey, turn.role, turn.text).catch(console.warn);
    },
  });

  const connect = useCallback(async () => {
    try {
      setStatus("connecting");
      setError(null);

      if (!configuredRef.current) {
        const { token } = await fetchVoiceToken();
        configure({ apiKey: token });
        configuredRef.current = true;
      }

      await agent.connect();
    } catch (err) {
      setError(String(err));
      setStatus("error");
      configuredRef.current = false;
    }
  }, [agent]);

  const disconnect = useCallback(() => {
    agent.disconnect();
    configuredRef.current = false;
    setStatus("idle");
  }, [agent]);

  return { status, transcript, error, connect, disconnect };
}
