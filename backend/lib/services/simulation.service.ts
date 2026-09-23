import { randomUUID as uuidv4 } from "node:crypto";
import { generateFromAI } from "../ai/pipeline/generate";
import { validateOutput } from "../ai/pipeline/validate";
import { repairOutput } from "../ai/pipeline/repair";
import { SIMULATE_SYSTEM_PROMPT, buildSimulateUserPrompt } from "../ai/prompts/simulate.prompt";
import { SimulationResponseSchema, SimulationResponse } from "../schemas/simulation.schema";
import { saveSimulation, loadSimulation } from '../storage';
import { runtimeMode } from '../runtime';
import { createDemo } from '../demo/examples';
import { simulationCache } from "../utils/cache";
import { logger } from "../utils/logger";
import { GROQ_MODEL } from "../ai/groq";
import { AppError } from "../utils/errors";

export interface SimulateRequest {
  scenario: string;
  user_context?: Record<string, unknown>;
  duration_focus?: "all" | "immediate" | "short_term" | "long_term";
}

/**
 * Simulation Service
 *
 * Orchestrates the full generate â†’ validate â†’ repair â†’ persist pipeline
 * for POST /api/simulate.
 */
export async function runSimulation(req: SimulateRequest): Promise<SimulationResponse> {
  const { scenario, duration_focus = "all" } = req;
  if(runtimeMode() === 'demo') {
    const result=createDemo(scenario,duration_focus);
    await saveSimulation(result);
    return result;
  }

  if (!scenario || scenario.trim().length < 5) {
    throw new AppError("bad_request", "Scenario must be at least 5 characters.", 400);
  }

  // â”€â”€â”€ Cache Check â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const cacheKey = simulationCache.key(`${scenario}::${duration_focus}`);
  const cached = simulationCache.get(cacheKey);
  if (cached) {
    logger.info("[SimulationService] Cache hit");
    return cached as SimulationResponse;
  }

  // â”€â”€â”€ Build Prompts â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const systemPrompt = SIMULATE_SYSTEM_PROMPT;
  const userPrompt = buildSimulateUserPrompt(scenario, duration_focus);
  const simulation_id = uuidv4();

  // â”€â”€â”€ Generate â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const rawData = await generateFromAI({
    systemPrompt,
    userPrompt,
    endpoint: "simulate",
  });

  // Inject required top-level fields before validation
  const dataWithMeta = {
    ...(rawData as object),
    simulation_id,
    metadata: {
      scenario,
      duration_focus,
      generated_at: new Date().toISOString(),
      model: GROQ_MODEL,
      mode: "live",
    },
  };

  // â”€â”€â”€ Validate â†’ Repair if needed â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  let simulation: SimulationResponse;
  try {
    simulation = validateOutput(SimulationResponseSchema, dataWithMeta, "simulate", 1);
  } catch (err) {
    if (err instanceof AppError && err.type === "validation_error") {
      simulation = await repairOutput({
        schema: SimulationResponseSchema,
        systemPrompt,
        userPrompt,
        endpoint: "simulate",
        badData: dataWithMeta,
        issues: (err.details as string[]) ?? [],
      });
      // Re-inject metadata after repair
      simulation.simulation_id = simulation_id;
      simulation.metadata = {
        scenario,
        duration_focus,
        generated_at: new Date().toISOString(),
        model: GROQ_MODEL,
      mode: "live",
      };
    } else {
      throw err;
    }
  }

  await saveSimulation(simulation);

  // â”€â”€â”€ Cache Result â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  simulationCache.set(cacheKey, simulation);

  return simulation;
}

/**
 * Retrieves a previously saved simulation by ID.
 */
export async function getSimulationById(id: string): Promise<SimulationResponse | null> {
  return loadSimulation(id);
}
