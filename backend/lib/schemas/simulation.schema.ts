import { z } from "zod";
import { NodeSchema } from "./node.schema";
import { EdgeSchema } from "./edge.schema";
import { TimelineSchema } from "./timeline.schema";
import { SectorImpactSchema } from "./sector.schema";
import { ParticipantSchema } from "./debate.schema";

/**
 * The complete simulation response returned by POST /api/simulate.
 * Enforces all minimum counts defined in the PRD:
 *   - ≥ 6 nodes
 *   - ≥ 5 edges
 *   - ≥ 4 sector_impacts
 *   - ≥ 3 debate_participants
 */
export const SimulationResponseSchema = z.object({
  simulation_id: z.string().uuid(),
  title: z.string().min(1),
  summary: z.string().min(1),
  systems: z.array(z.string()).min(1),
  nodes: z.array(NodeSchema).min(6, "Minimum 6 nodes required").max(80),
  edges: z.array(EdgeSchema).min(5, "Minimum 5 edges required").max(160),
  timeline: TimelineSchema,
  sector_impacts: z.array(SectorImpactSchema).min(4).max(12),
  debate_participants: z.array(ParticipantSchema).min(3).max(8),
  metadata: z.object({
    scenario: z.string(),
    duration_focus: z.string(),
    generated_at: z.string(),
    model: z.string(),
    mode: z.enum(['demo', 'live']).default('live'),
    example_id: z.string().optional(),
    assumption: z.string().optional(),
    parent_id: z.string().uuid().optional(),
    mutation_prompt: z.string().optional(),
  }),
}).superRefine((simulation, ctx) => {
  const ids = new Set(simulation.nodes.map(node => node.id));
  if (ids.size !== simulation.nodes.length) ctx.addIssue({code:'custom',path:['nodes'],message:'Node IDs must be unique.'});
  if(new Set(simulation.edges.map(edge=>edge.id)).size!==simulation.edges.length) ctx.addIssue({code:'custom',path:['edges'],message:'Edge IDs must be unique.'});
  simulation.edges.forEach((edge, index) => {
    if (!ids.has(edge.source) || !ids.has(edge.target)) ctx.addIssue({code:'custom',path:['edges',index],message:'Edges must reference existing nodes.'});
  });
  if(new Set(simulation.debate_participants.map(p=>p.id)).size!==simulation.debate_participants.length) ctx.addIssue({code:'custom',path:['debate_participants'],message:'Participant IDs must be unique.'});
});

export type SimulationResponse = z.infer<typeof SimulationResponseSchema>;
