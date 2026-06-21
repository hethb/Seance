import { createClient } from "redis";
import { config, caps } from "../config.js";
import type { SessionState } from "../types.js";

// The "wow" depth feature: the SAME physical object remembers you across
// sessions. Keyed by persona.objectKey, so pointing the camera at the same red
// stapler tomorrow resumes the relationship.
//
// Redis is BEST-EFFORT. On flaky conference wifi the configured Redis URL is
// often unreachable, and a hanging `get`/`set` would stall every awaken/converse
// for seconds. So we fail fast (short connect + per-command timeout) and fall
// back to an in-process Map. The Map gives per-session memory (resets on server
// restart) — enough for a live demo; real Redis upgrades it to cross-session.

const mem = new Map<string, SessionState>();

let redis = caps.hasRedis
  ? createClient({
      url: config.redisUrl,
      socket: { connectTimeout: 2_000, reconnectStrategy: false },
    })
  : null;
let redisReady = false;
let redisDead = false; // once true, we stop trying Redis for the rest of the run

/** Bound any Redis op so a broken socket can never hang a request. */
function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error("redis timeout")), ms),
    ),
  ]);
}

async function getRedis() {
  if (!redis || redisDead) return null;
  if (redisReady) return redis;
  try {
    // Swallow async socket errors — call sites handle failures and fall back.
    redis.on("error", () => {});
    await withTimeout(redis.connect(), 2_500);
    redisReady = true;
    return redis;
  } catch {
    console.error("Redis unreachable — using in-memory memory for this run.");
    redisDead = true;
    redis = null;
    return null;
  }
}

const KEY = (objectKey: string) => `seance:object:${objectKey}`;
// A set of every awakened objectKey, so the history page can enumerate them.
const INDEX = "seance:index";

export async function loadState(objectKey: string): Promise<SessionState | null> {
  const r = await getRedis();
  if (r) {
    try {
      const raw = await withTimeout(r.get(KEY(objectKey)), 1_500);
      if (raw) return JSON.parse(raw) as SessionState;
      // Miss in Redis: fall through to whatever the local Map has.
    } catch {
      redisDead = true; // give up on Redis, serve from Map below
    }
  }
  return mem.get(objectKey) ?? null;
}

export async function saveState(state: SessionState): Promise<void> {
  const key = state.persona.objectKey;
  // Always keep a local copy so fallback reads work even if Redis is down.
  mem.set(key, state);
  const r = await getRedis();
  if (r) {
    try {
      // 7-day TTL so the demo db stays tidy; drop the option to keep forever.
      // Also record the key in the index set so /api/history can list everything.
      await withTimeout(
        Promise.all([
          r.set(KEY(key), JSON.stringify(state), { EX: 60 * 60 * 24 * 7 }),
          r.sAdd(INDEX, key),
        ]),
        1_500,
      );
    } catch {
      redisDead = true;
    }
  }
}

/**
 * Every awakened object, for the history page. Redis when reachable, else the
 * in-process Map (so history still renders in mock/offline mode). Best-effort.
 */
export async function listStates(): Promise<SessionState[]> {
  const r = await getRedis();
  if (r) {
    try {
      const keys = await withTimeout(r.sMembers(INDEX), 1_500);
      if (keys.length > 0) {
        const raws = await withTimeout(r.mGet(keys.map(KEY)), 1_500);
        const states = raws
          .filter((raw): raw is string => Boolean(raw))
          .map((raw) => JSON.parse(raw) as SessionState);
        if (states.length > 0) return states;
      }
    } catch {
      redisDead = true; // fall through to the Map
    }
  }
  return [...mem.values()];
}

/**
 * UPGRADE PATH: swap this hand-rolled history for the Redis Agent Memory Server
 * (https://redis.github.io/agent-memory-server) to get semantic long-term recall
 * — the object could then remember *topics* across many strangers, not just the
 * last transcript. Great "we used Redis for real" story for the judges.
 */
