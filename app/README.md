# 🔮 Séance — Mobile App (Task 3: App Shell)

The Expo / React Native client for Séance. Point your phone at any object, watch
it wake up as a character, and talk to it out loud.

This app is the **front of the pipeline** — it captures a photo and drives the
screen flow, talking to the Séance server (the Express app at the repo root) over
its two endpoints. The server can run fully mocked with **zero API keys**, so the
whole flow works on a real phone before any sponsor integration lands.

```
Capture ──photo──▶ Awakening ──/api/awaken──▶ Reveal ──▶ Conversation
 (camera)          ("waking up…")             (portrait    (hold-to-talk,
                                               + persona)    /api/converse)
```

## Run it on your phone (≈3 minutes)

1. **Start the server** (from the repo root, one level up):
   ```bash
   cd ..
   npm install
   cp .env.example .env   # works empty — every key is optional
   npm run dev            # → serves the API on http://<your-lan-ip>:3000
   ```
2. **Start the app** (from this `app/` folder):
   ```bash
   npm install
   npx expo install --fix   # aligns native module versions to your Expo SDK
   npx expo start
   ```
3. Open **Expo Go** on your phone (same Wi-Fi as your laptop) and scan the QR code.
4. Allow **camera** and **microphone** when prompted, point at an object, and tap
   **Awaken**.

> **The phone finds the server automatically.** On device, `localhost` is the
> phone, not your laptop — so [`src/config.ts`](src/config.ts) reads the LAN IP
> Expo already used to load the bundle (`Constants.expoConfig.hostUri`) and points
> the API at `http://<that-ip>:3000`. Override with `EXPO_PUBLIC_API_URL` if your
> server lives elsewhere (a tunnel, a deployed box, etc.).

## Project layout

```
app/
  App.tsx                 NavigationContainer + dark séance theme
  index.ts                Expo entry point
  app.json                Expo config + camera/mic permission strings
  src/
    config.ts             API base URL (LAN autodetect) + media URL resolver
    types.ts              Persona / AwakenResponse / ConverseResponse (mirror server)
    theme.ts              one shared spooky palette + spacing/radius/type tokens
    navigation.tsx        the Capture → Awakening → Reveal → Conversation stack
    api/client.ts         awaken() and converse() — the only two server calls
    screens/
      CaptureScreen.tsx        camera preview + capture, library fallback, permissions
      AwakeningScreen.tsx      animated "waking up…" loader (min 2.8s of theatre)
      RevealScreen.tsx         portrait + name + tagline + spoken opening line
      ConversationScreen.tsx   hold-to-talk mic, transcript, base64-mp3 playback
```

## How it talks to the server

| Screen | Call | Endpoint |
|---|---|---|
| Awakening | `awaken(imageDataUrl)` | `POST /api/awaken` → `{ persona, portraitUrl, encounters, returning }` |
| Conversation | `converse({ objectKey, audioUri \| text })` | `POST /api/converse` → `{ userText, replyText, audio, voiceModel }` |

Both live in [`src/api/client.ts`](src/api/client.ts). The portrait may come back
as a `data:` URL (mock mode) or a server path — `resolveMediaUrl()` handles both.

## Scope notes (Task 3)

- **Voice in/out is wired but minimal.** Hold-to-talk records audio (`expo-av`),
  sends it, and plays the spoken reply when Deepgram is live. Task 4 refines the
  voice loop (and a TTS'd opening line); in mock mode the reply shows as text with
  a "🔇 voice off" hint since there's no native browser-TTS fallback.
- **Permissions are requested early on purpose.** Camera is asked on the capture
  screen and the mic is pre-warmed there too, so the conversation screen doesn't
  prompt cold. If you ever get stuck denied, the UI deep-links to Settings.
- Built with `expo-camera`, `expo-image-picker`, and `expo-av` per the spec.
