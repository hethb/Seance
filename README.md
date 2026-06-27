# 🔮 Séance

**Point your phone at *any* object and it wakes up as a character you can have a live voice conversation with.**

Built at Cal AI Hacks 2026.

---

## The pitch

> Séance is a spirit medium for objects. Point the camera at a stapler, a mug, a backpack — Claude looks at it, invents the larger-than-life character secretly living inside, paints its portrait, gives it a voice, and lets you talk to it out loud. It *remembers you* the next time you point the camera at the same thing. Bring two objects together and they meet each other — their relationship is saved too.

---

## How it works

```
 📷 camera frame
     │
     ▼
 🧠 Claude (vision)       forced tool-use → exactly 3 ranked Persona objects
     │                    (name, archetype, voice model, opening line, portrait prompt)
     ▼
 🎨 portrait gen          paints the character portrait
     │                    Gemini Imagen 3 / Adobe Firefly / Pollinations (mystery objects)
     ▼
 🗣️  Deepgram             you speak → STT; Claude replies → TTS in the character's own voice
     │
     ▼
 🧠 Claude (chat)         replies in character, in persona, 1-2 sentences per turn
     │
     ▼
 💾 Redis                 object remembers you across sessions (keyed by objectKey)
                          pair dynamic memory for two-object encounters
```

---

## Features

- **30 archetypes** — grumpy elder, dramatic diva, conspiracy theorist, mob boss, and 26 more. Claude picks the best fit for the object and commits hard to its voice.
- **Persona picker** — Claude ranks 3 personas by fit on the reveal screen; user can swap before starting the conversation. The chosen persona is saved without resetting history.
- **Object memory** — scan the same object tomorrow and it picks up where it left off. Keyed by a normalized `objectKey` in Redis with a 7-day TTL.
- **Two-object encounters** — bring two awakened objects together, set a dynamic ("rivals", "old friends", etc.), and Claude generates a 6-line scripted scene between them in both characters' voices. The pair dynamic is saved so their relationship evolves.
- **AliveAvatar** — the portrait moves. Archetype-specific idle/talking motion, blinking eyes, drifting pupils, eyebrow raises, and lip sync — all procedural React Native `Animated` with the native driver. Zero design assets, zero native deps.
- **Awaken progress** — atmospheric log lines tick during the API call so a 30s response never feels broken.

---

## Stack

| Layer | Tech |
|---|---|
| Mobile client | React Native (Expo), Expo Router |
| API server | Node.js / Express (TypeScript) |
| AI — persona + chat | Claude API (Anthropic) — `claude-opus-4-8` / `claude-sonnet-4-6` |
| Speech | Deepgram STT + TTS (Aura-2 voice models) |
| Portrait generation | Gemini Imagen 3 (`GEMINI_API_KEY`) · Adobe Firefly · Pollinations.ai (fallback) |
| Memory | Redis (7-day TTL) · in-process Map fallback for local dev |

---

## Quickstart

```bash
npm install
cp .env.example .env     # works empty — every key is optional
npm run dev              # → API on http://localhost:3000
```

The API server runs immediately. The phone client is the Expo app in `mobile/` — run it with `cd mobile && npx expo start`.

> **Runs with zero API keys.** With no `.env`, persona is a canned fallback and portrait is the captured photo. Add keys one at a time — the server logs which capabilities are live on boot.

### Environment variables

```
ANTHROPIC_API_KEY        real personalities and conversation
DEEPGRAM_API_KEY         spoken voice in and out
IMAGE_PROVIDER           gemini | firefly | mock (default: mock)
GEMINI_API_KEY           required when IMAGE_PROVIDER=gemini
GEMINI_IMAGE_MODEL       default: gemini-2.5-flash-image
ADOBE_FIREFLY_CLIENT_ID  required when IMAGE_PROVIDER=firefly
ADOBE_FIREFLY_CLIENT_SECRET
REDIS_URL                persistent memory across restarts
PORT                     default: 3000
```

---

## Project layout

```
src/
  server.ts          Express API — all endpoints
  config.ts          env reading + capability flags
  types.ts           Persona / Turn / SessionState / Archetype
  lib/
    claude.ts        awakenAll() · reply() · generateEncounter() · archetypeCatalog()
    deepgram.ts      transcribe() · speak()
    imagegen.ts      paintPortrait() · generateMysteryPortrait()
    memory.ts        loadState() · saveState() · loadPairDynamic() · savePairDynamic()
    history.ts       recordSession() · listSessions() · getSession()
mobile/
  app/
    index.tsx        capture screen — camera / library picker
    awaken.tsx       loading screen — progress log lines while API processes
    reveal.tsx       persona reveal — auto-TTS opening line, persona picker
    conversation.tsx voice conversation screen — hold-to-talk, chat transcript
    encounter.tsx    two-object scene — scripted exchange with replay + exit CTAs
  src/
    api.ts           typed fetch wrappers for all endpoints
    sessionStore.ts  module-level handoff for large data (image, awaken/encounter results)
    components/
      AliveAvatar.tsx  procedural portrait animation + face overlay
    hooks/
      useConverse.ts   voice session state machine
scripts/
  test-ux-fixes.ts      UX fix test suite (32 assertions)
  test-persona-picker.ts
  test-encounter.ts
```

---

## API reference

| Method | Path | Body | Returns |
|---|---|---|---|
| `POST` | `/api/awaken` | `{ image, objectKey? }` | `{ persona, personas[], portraitUrl, encounters, returning, history }` |
| `POST` | `/api/select-persona` | `{ objectKey, persona }` | `{ ok }` |
| `POST` | `/api/converse` | multipart: `objectKey`, `audio?`, `text?` | `{ userText, replyText, audio? }` |
| `POST` | `/api/encounter` | `{ objectKey1, objectKey2, dynamic? }` | `{ lines, relationship, persona1, persona2, portraitUrl1, portraitUrl2 }` |
| `POST` | `/api/tts` | `{ text, voiceModel? }` | `{ audio }` |
| `POST` | `/api/turns` | `{ objectKey, turns[] }` | `{ ok }` |
| `GET` | `/api/history` | — | `{ sessions[] }` |
| `GET` | `/api/history/:objectKey` | — | `{ persona, portraitUrl, history, encounters }` |
| `GET` | `/api/archetypes` | — | `{ archetypes[] }` |
| `GET` | `/api/status` | — | capability flags |

---

## Running tests

```bash
npm run test:ux-fixes       # 32 assertions across all UX fixes
npm run test:persona-picker # persona picker + select-persona endpoint
npm run test:encounter      # encounter + pair dynamic memory
```

---

Go talk to your stapler.
