import { z } from "zod";
import { randomUUID as uuidv4 } from "node:crypto";
import { generateFromAI } from "../ai/pipeline/generate";
import { validateOutput } from "../ai/pipeline/validate";
import { repairOutput } from "../ai/pipeline/repair";
import { MUTATE_SYSTEM_PROMPT, buildMutateUserPrompt } from "../ai/prompts/mutate.prompt";
import { NodeSchema, Node } from "../schemas/node.schema";
import { EdgeSchema } from "../schemas/edge.schema";
import { TimelineSchema } from "../schemas/timeline.schema";
import { SectorImpactSchema } from "../schemas/sector.schema";
import { saveSimulation } from '../storage';
import { runtimeMode } from '../runtime';
import { branchDemo } from '../demo/examples';
import { SimulationResponse, SimulationResponseSchema } from '../schemas/simulation.schema';
import { getSimulationById } from "./simulation.service";
import { logger } from "../utils/logger";
import { AppError } from "../utils/errors";

/* â”€â”€â”€ Delta Schema â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
 * The model only outputs NEW and CHANGED nodes.
 * The server merges them with original nodes from the DB.
 */
const DeltaMutationSchema = z.object({
  divergence_nodes: z.array(z.string()).min(1),
  new_nodes: z.array(NodeSchema).default([]),
  modified_node_ids: z.array(z.string()).default([]),
  modified_nodes: z
    .array(
      z.object({
        id: z.string(),
        impact_score: z.number().min(-100).max(100).optional(),
        impact_direction: z.enum(["positive", "negative", "neutral"]).optional(),
        confidence: z.number().min(0).max(1).optional(),
        duration: z
          .object({
            immediate: z.number().min(-100).max(100),
            short_term: z.number().min(-100).max(100),
            long_term: z.number().min(-100).max(100),
          })
          .optional(),
        mutated: z.boolean().optional(),
      })
    )
    .default([]),
  updated_edges: z.array(EdgeSchema).min(5),
  updated_timeline: TimelineSchema,
  updated_sector_impacts: z.array(SectorImpactSchema).min(4),
  mutation_summary: z.string().min(1),
});

type DeltaMutation = z.infer<typeof DeltaMutationSchema>;

/* â”€â”€â”€ Final Mutation Response â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€*/
export interface MutationResponse {
  mutation_id: string;
  divergence_nodes: string[];
  updated_nodes: Node[];
  updated_edges: z.infer<typeof EdgeSchema>[];
  updated_timeline: z.infer<typeof TimelineSchema>;
  updated_sector_impacts: z.infer<typeof SectorImpactSchema>[];
  mutation_summary: string;
  simulation: SimulationResponse;
}

export interface MutateRequest {
  simulation_id: string;
  existing_state: Record<string, unknown>;
  mutation_prompt: string;
}

/**
 * Mutation Service â€” Delta Approach
 *
 * 1. Loads full original simulation from Supabase (for complete node data)
 * 2. Sends compressed node list to model (just IDs + labels for reference)
 * 3. Model returns ONLY new/changed nodes + full edges/timeline/sectors
 * 4. Server merges delta with original full nodes
 */
export async function runMutation(req: MutateRequest): Promise<MutationResponse> {
  const { simulation_id, existing_state, mutation_prompt } = req;
  if(runtimeMode() === 'demo') {
    const original=await getSimulationById(simulation_id);
    if(!original) throw new AppError('not_found','The original notebook was not found.',404);
    const branch=branchDemo(original,mutation_prompt);
    await saveSimulation(branch);
    return {mutation_id:branch.simulation_id,divergence_nodes:['n3','n4'],updated_nodes:branch.nodes,updated_edges:branch.edges,updated_timeline:branch.timeline,updated_sector_impacts:branch.sector_impacts,mutation_summary:branch.summary,simulation:branch};
  }

  if (!mutation_prompt || mutation_prompt.trim().length < 3) {
    throw new AppError("bad_request", "mutation_prompt is required.", 400);
  }

  // â”€â”€â”€ Load full simulation â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  let fullSimulation: Record<string, unknown> | null = null;

  // Try DB first, fall back to existing_state from request
  try {
    const saved = await getSimulationById(simulation_id);
    if (saved) fullSimulation = saved as unknown as Record<string, unknown>;
  } catch {
    // non-fatal
  }

  if (!fullSimulation && existing_state && Object.keys(existing_state).length > 0) {
    fullSimulation = existing_state;
  }

  if (!fullSimulation) {
    throw new AppError(
      "not_found",
      `Simulation ${simulation_id} not found. Provide existing_state in the request body.`,
      404
    );
  }

  const originalNodes: Node[] = Array.isArray(fullSimulation.nodes)
    ? (fullSimulation.nodes as Node[])
    : [];

  if((fullSimulation as unknown as SimulationResponse).simulation_id !== simulation_id) throw new AppError('bad_request','existing_state must match simulation_id.',400);

  // â”€â”€â”€ Generate â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const systemPrompt = MUTATE_SYSTEM_PROMPT;
  const userPrompt = buildMutateUserPrompt(mutation_prompt, fullSimulation);

  const rawData = await generateFromAI({
    systemPrompt,
    userPrompt,
    endpoint: "mutate",
    temperature: 0.6,
  });

  // â”€â”€â”€ Validate â†’ Repair â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  let delta: DeltaMutation;
  try {
    delta = validateOutput(DeltaMutationSchema, rawData, "mutate", 1);
  } catch (err) {
    if (err instanceof AppError && err.type === "validation_error") {
      delta = await repairOutput({
        schema: DeltaMutationSchema,
        systemPrompt,
        userPrompt,
        endpoint: "mutate",
        badData: rawData,
        issues: (err.details as string[]) ?? [],
      });
    } else {
      throw err;
    }
  }

  // â”€â”€â”€ Server-side merge â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // Build a map of original nodes by ID for fast lookup
  const originalNodeMap = new Map<string, Node>(originalNodes.map((n) => [n.id, n]));

  // Apply modifications to existing nodes
  for (const mod of delta.modified_nodes) {
    const orig = originalNodeMap.get(mod.id);
    if (orig) {
      originalNodeMap.set(mod.id, {
        ...orig,
        ...(mod.impact_score !== undefined && { impact_score: mod.impact_score }),
        ...(mod.impact_direction !== undefined && { impact_direction: mod.impact_direction }),
        ...(mod.confidence !== undefined && { confidence: mod.confidence }),
        ...(mod.duration !== undefined && { duration: mod.duration }),
        mutated: true,
      } as Node);
    }
  }

  // Add new nodes (mark as mutated)
  for (const newNode of delta.new_nodes) {
    originalNodeMap.set(newNode.id, { ...newNode, mutated: true } as Node);
  }

  const mergedNodes = Array.from(originalNodeMap.values());

  const mutation_id = uuidv4();
  const original=SimulationResponseSchema.parse(fullSimulation);
  const branch=validateOutput(SimulationResponseSchema,{
    ...original,simulation_id:mutation_id,title:`${original.title} Â· branch`,summary:delta.mutation_summary,
    nodes:mergedNodes,edges:delta.updated_edges,timeline:delta.updated_timeline,sector_impacts:delta.updated_sector_impacts,
    metadata:{...original.metadata,mode:'live',parent_id:simulation_id,mutation_prompt,generated_at:new Date().toISOString()}
  },'mutate:merged',1);
  const result: MutationResponse = {
    mutation_id,
    divergence_nodes: delta.divergence_nodes,
    updated_nodes: mergedNodes,
    updated_edges: delta.updated_edges,
    updated_timeline: delta.updated_timeline,
    updated_sector_impacts: delta.updated_sector_impacts,
    mutation_summary: delta.mutation_summary,
    simulation: branch,
  };

  await saveSimulation(branch);

  logger.info("[MutationService] Mutation complete", {
    mutation_id,
    simulation_id,
    new_nodes: delta.new_nodes.length,
    modified_nodes: delta.modified_nodes.length,
    total_merged: mergedNodes.length,
  });

  return result;
}
