import Constants from "expo-constants";

// ── Where the Séance server lives ─────────────────────────────────────────────
// On a real phone the server isn't on `localhost` — it's on your laptop's LAN IP.
// Expo Go already knows that IP (it's how it loaded the JS bundle), exposed as
// `hostUri` like "192.168.1.42:8081". We reuse that host and swap in the API port
// so the app "just works" on device with no manual IP typing.
//
// Override anytime with EXPO_PUBLIC_API_URL (e.g. a deployed/tunnel URL).

const API_PORT = 3000;

function deriveApiBaseUrl(): string {
  const explicit = process.env.EXPO_PUBLIC_API_URL;
  if (explicit) return explicit.replace(/\/$/, "");

  const hostUri =
    Constants.expoConfig?.hostUri ??
    // Older manifest shape, present in some Expo Go builds.
    (Constants as { manifest?: { debuggerHost?: string } }).manifest?.debuggerHost ??
    "";
  const host = hostUri.split(":")[0];
  if (host) return `http://${host}:${API_PORT}`;

  // Last resort (simulator on the same machine).
  return `http://localhost:${API_PORT}`;
}

export const API_BASE_URL = deriveApiBaseUrl();

/**
 * The portrait can come back as a `data:` URL (mock mode) or as a server path.
 * `data:` and absolute http(s) URLs render as-is; a relative path gets the API
 * origin prepended so <Image> can load it on device.
 */
export function resolveMediaUrl(url: string): string {
  if (!url) return url;
  if (url.startsWith("data:") || /^https?:\/\//.test(url)) return url;
  return `${API_BASE_URL}/${url.replace(/^\//, "")}`;
}
