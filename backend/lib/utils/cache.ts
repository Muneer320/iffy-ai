/* ─── Simple In-Memory Cache ────────────────────────────────────────────────
 *
 * Caches identical prompts to avoid re-generating the same simulation.
 * Key: SHA-256 of the prompt string. Value: parsed simulation JSON.
 * TTL: 1 hour (configurable).
 *
 * NOTE: This is per-process in-memory only. Use Redis for multi-instance
 * deployments (future architecture).
 */

import { createHash } from "crypto";
import type { SimulationResponse } from '../schemas/simulation.schema';

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

const TTL_MS = 60 * 60 * 1000; // 1 hour

class SimpleCache<T> {
  private store = new Map<string, CacheEntry<T>>();

  /** Returns a deterministic key for a given prompt string. */
  key(prompt: string): string {
    return createHash("sha256").update(prompt.trim()).digest("hex");
  }

  get(key: string): T | null {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return null;
    }
    return entry.value;
  }

  set(key: string, value: T, ttl = TTL_MS): void {
    this.prune();
    if(this.store.size>=100 && !this.store.has(key)) this.store.delete(this.store.keys().next().value!);
    this.store.set(key, { value, expiresAt: Date.now() + ttl });
  }

  has(key: string): boolean {
    return this.get(key) !== null;
  }

  /** Evict all expired entries (call periodically if needed). */
  prune(): void {
    const now = Date.now();
    for (const [k, v] of this.store.entries()) {
      if (now > v.expiresAt) this.store.delete(k);
    }
  }
}

// Singleton cache — shared across all requests in the same process.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const simulationCache = new SimpleCache<SimulationResponse>();
