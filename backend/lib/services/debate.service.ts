import { z } from "zod";
import { randomUUID as uuidv4 } from "node:crypto";
import { generateFromAI } from "../ai/pipeline/generate";
import { validateOutput } from "../ai/pipeline/validate";
import { repairOutput } from "../ai/pipeline/repair";
import {
  DEBATE_SYSTEM_PROMPT,
  buildDebateUserPrompt,
} from "../ai/prompts/debate.prompt";
import { DebateSchema, DebateMessage, DebateMessageSchema, Participant, ParticipantSchema } from "../schemas/debate.schema";
import { saveDebate, loadSimulation } from '../storage';
import { runtimeMode } from '../runtime';
import { demoDebate } from '../demo/examples';
import { logger } from "../utils/logger";
import { AppError } from "../utils/errors";

const ContinuationResponseSchema = z.object({
  messages: z.array(DebateMessageSchema).min(1).max(12),
});

const ParticipantsResponseSchema = z.object({
  participants: z.array(ParticipantSchema).min(3).max(8),
});

export interface DebateRequest {
  simulation_id: string;
  participants: Participant[];
  existing_messages: DebateMessage[];
  continuation_prompt?: string;
  scenario?: string;
  mode?: "participants" | "messages" | "full";
}

export interface DebateResponse {
  debate_id: string;
  participants: Participant[];
  messages: DebateMessage[];
}

/**
 * Debate Service
 *
 * Generates initial debate or continues an existing one.
 * Maintains conversational memory by including previous messages in context.
 */
export async function runDebate(req: DebateRequest): Promise<DebateResponse> {
  const saved=await loadSimulation(req.simulation_id);
  if(!saved) throw new AppError('not_found','The notebook was not found.',404);
  if(runtimeMode() === 'demo') {
    if(req.continuation_prompt || req.existing_messages.length) throw new AppError('bad_request','The demo contains one authored opening debate. Follow-ups require live mode.',422);
    const result=demoDebate(saved);
    await saveDebate(result.debate_id,req.simulation_id,result);
    return result;
  }
  const {
    simulation_id,
    participants,
    existing_messages,
    continuation_prompt,
    scenario = saved.metadata.scenario,
  } = req;

  const mode = req.mode ?? (existing_messages.length === 0 && participants.length === 0 ? "full" : "messages");
  const systemPrompt = DEBATE_SYSTEM_PROMPT;
  const userPrompt = buildDebateUserPrompt(
    scenario,
    participants,
    existing_messages,
    continuation_prompt,
    mode
  );

  const rawData = await generateFromAI({
    systemPrompt,
    userPrompt,
    endpoint: "debate",
    temperature: 0.85, // Higher temp for personality variety
    maxTokens: mode === "participants" ? 1024 : 4096,
  });

  let result: DebateResponse;

  if (mode === "participants") {
    let partData;
    try {
      partData = validateOutput(ParticipantsResponseSchema, rawData, "debate:participants", 1);
    } catch (err) {
      if (err instanceof AppError && err.type === "validation_error") {
        partData = await repairOutput({
          schema: ParticipantsResponseSchema,
          systemPrompt,
          userPrompt,
          endpoint: "debate:participants",
          badData: rawData,
          issues: (err.details as string[]) ?? [],
        });
      } else {
        throw err;
      }
    }
    result = {
      debate_id: uuidv4(),
      participants: partData.participants,
      messages: [],
    };
  } else if (mode === "full") {
    // Full debate generation â€” validate against full DebateSchema
    let debate;
    try {
      debate = validateOutput(DebateSchema, rawData, "debate", 1);
    } catch (err) {
      if (err instanceof AppError && err.type === "validation_error") {
        debate = await repairOutput({
          schema: DebateSchema,
          systemPrompt,
          userPrompt,
          endpoint: "debate",
          badData: rawData,
          issues: (err.details as string[]) ?? [],
        });
      } else {
        throw err;
      }
    }
    result = {
      debate_id: uuidv4(),
      participants: debate.participants,
      messages: debate.messages,
    };
  } else {
    // Continuation or messages-only â€” only validate the new messages
    let continuation;
    try {
      continuation = validateOutput(ContinuationResponseSchema, rawData, "debate:continue", 1);
    } catch (err) {
      if (err instanceof AppError && err.type === "validation_error") {
        continuation = await repairOutput({
          schema: ContinuationResponseSchema,
          systemPrompt,
          userPrompt,
          endpoint: "debate:continue",
          badData: rawData,
          issues: (err.details as string[]) ?? [],
        });
      } else {
        throw err;
      }
    }
    result = {
      debate_id: uuidv4(),
      participants,
      messages: [...existing_messages, ...continuation.messages],
    };
  }

  const ids=new Set(result.participants.map(p=>p.id));
  if(result.messages.some(m=>!ids.has(m.speaker_id))) throw new AppError('ai_generation_error','A debate message referenced an unknown speaker.',502);
  await saveDebate(result.debate_id,simulation_id,result);
  return result;
}
