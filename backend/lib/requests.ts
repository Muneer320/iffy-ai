import { z } from 'zod';
import { SimulationResponseSchema } from './schemas/simulation.schema';
import { ParticipantSchema, DebateMessageSchema } from './schemas/debate.schema';

export const SimulateRequestSchema=z.object({scenario:z.string().trim().min(5).max(1200), duration_focus:z.enum(['all','immediate','short_term','long_term']).default('all')});
export const MutateRequestSchema=z.object({simulation_id:z.string().uuid(),existing_state:SimulationResponseSchema.optional(),mutation_prompt:z.string().trim().min(3).max(600)});
export const DebateRequestSchema=z.object({simulation_id:z.string().uuid(),participants:z.array(ParticipantSchema).max(8).default([]),existing_messages:z.array(DebateMessageSchema).max(36).default([]),continuation_prompt:z.string().trim().max(600).optional(),scenario:z.string().trim().max(1200).optional(),mode:z.enum(['participants','messages','full']).optional()});
export const SectorRequestSchema=z.object({simulation_id:z.string().uuid(),sector:z.string().trim().min(1).max(100)});
