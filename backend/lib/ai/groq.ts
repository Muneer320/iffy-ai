import Groq from "groq-sdk";
import { runtimeMode } from '../runtime';

let _client: Groq | null = null;

/**
 * Returns a singleton Groq client.
 * Throws early if GROQ_API_KEY is missing so the error is clear.
 */
export function getGroqClient(): Groq {
  if(runtimeMode() === 'demo') throw new Error('External model calls are disabled in demo mode.');
  if (!_client) {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
      throw new Error(
        "[Groq] GROQ_API_KEY environment variable is not set. " +
          "Copy .env.local.example → .env.local and fill in your key."
      );
    }
    _client = new Groq({ apiKey, maxRetries: 0, timeout: 20_000, fetch: (url, init) => fetch(url, init) });
  }
  return _client;
}

/** The model identifier used for all AI calls. */
export const GROQ_MODEL =
  process.env.GROQ_MODEL ?? "llama-3.3-70b-versatile";

/** Maximum number of retry attempts after a failed/invalid generation. */
const retries = Number(process.env.AI_MAX_RETRIES ?? 1);
export const AI_MAX_RETRIES = Number.isInteger(retries) && retries >= 0 && retries <= 2 ? retries : 1;
