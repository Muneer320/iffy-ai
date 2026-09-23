import { z } from "zod";
import { generateFromAI } from "./generate";
import { validateOutput } from "./validate";
import { logger } from "../../utils/logger";
import { AppError } from "../../utils/errors";
import { AI_MAX_RETRIES } from "../groq";

interface RepairOptions<T> {
  schema: z.ZodType<T>;
  systemPrompt: string;
  userPrompt: string;
  endpoint: string;
  /** The bad data from the first attempt (sent back to the model to fix). */
  badData: unknown;
  /** Issues from the first validation failure. */
  issues: string[];
}

/**
 * Repair layer.
 *
 * When the initial generation fails validation, this sends the bad output
 * BACK to the model with the specific validation errors, asking it to
 * self-correct.  Attempts up to AI_MAX_RETRIES additional calls.
 */
export async function repairOutput<T>(opts: RepairOptions<T>): Promise<T> {
  const { schema, systemPrompt, endpoint, badData, issues } = opts;

  for (let attempt = 1; attempt <= AI_MAX_RETRIES; attempt++) {
    logger.warn(`[Repair] Attempting repair for ${endpoint} (repair attempt ${attempt})`, {
      issues,
    });

    const repairPrompt = `
Your previous response failed JSON schema validation.

Validation errors:
${issues.map((i) => `- ${i}`).join("\n")}

Your previous (invalid) response:
${JSON.stringify(badData, null, 2)}

Fix ONLY the fields that failed validation. Output the complete corrected JSON object.
Do NOT include any markdown, code fences, or explanations — only the raw JSON.
`.trim();

    try {
      const raw = await generateFromAI({
        systemPrompt,
        userPrompt: repairPrompt,
        endpoint: `${endpoint}:repair`,
        temperature: 0.3, // lower temperature for repair to be more precise
      });

      return validateOutput(schema, raw, endpoint, attempt);
    } catch (err) {
      if(err instanceof AppError && (err.type === 'rate_limit_error' || err.type === 'configuration_error')) throw err;
      if (attempt === AI_MAX_RETRIES) {
        logger.error(`[Repair] All repair attempts exhausted for ${endpoint}`, {
          error: String(err),
        });
        throw new AppError(
          "ai_generation_error",
          `Failed to generate valid output for ${endpoint} after repairs.`,
          502
        );
      }
    }
  }

  throw new AppError("ai_generation_error", "Model output failed validation and schema repairs are disabled.", 502);
}
