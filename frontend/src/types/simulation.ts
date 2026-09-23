/* ─────────────────────────────────────────────────────────────────
 * TypeScript types mirroring the backend Zod schemas exactly.
 * Keep in sync with backend/lib/schemas/
 * ───────────────────────────────────────────────────────────────── */

export interface NodeDuration {
  immediate: number;
  short_term: number;
  long_term: number;
}

export interface SimulationNode {
  id: string;
  label: string;
  description: string;
  impact_score: number;
  impact_direction: "positive" | "negative" | "neutral";
  confidence: number;
  duration: NodeDuration;
  tags: string[];
  mutated?: boolean;
}

export interface SimulationEdge {
  id: string;
  source: string;
  target: string;
  relationship: "increase" | "decrease" | "transform" | "destabilize" | "enable" | "block";
  strength: number;
  explanation: string;
}

export interface TimelineEvent {
  title: string;
  description: string;
  impact_level: number;
  affected_systems: string[];
}

export interface Timeline {
  immediate: TimelineEvent[];
  short_term: TimelineEvent[];
  long_term: TimelineEvent[];
}

export interface Metric {
  name: string;
  direction: "increase" | "decrease" | "stable";
  magnitude: number;
  confidence: number;
}

export interface SectorImpact {
  sector: string;
  overview: string;
  positive_effects: string[];
  negative_effects: string[];
  metrics: Metric[];
  ripple_effects: string[];
  confidence_score: number;
  sub_sectors?: { name: string; impact: string; explanation: string }[];
  key_players?: { type: string; group: string; reason: string }[];
}

export interface Participant {
  id: string;
  name: string;
  role: string;
  stance: "supportive" | "opposed" | "neutral" | "conflicted";
  biases: string[];
  personality: string;
  concerns: string[];
  goals: string[];
}

export interface DebateMessage {
  speaker_id: string;
  message: string;
  emotion: "excited" | "concerned" | "angry" | "hopeful" | "skeptical" | "neutral" | "passionate" | "resigned";
  stance_strength: number;
}

export interface SimulationMetadata {
  scenario: string;
  duration_focus: string;
  generated_at: string;
  model: string;
  mode: "demo" | "live";
  example_id?: string;
  assumption?: string;
  parent_id?: string;
  mutation_prompt?: string;
}

export interface SimulationResponse {
  simulation_id: string;
  title: string;
  summary: string;
  systems: string[];
  nodes: SimulationNode[];
  edges: SimulationEdge[];
  timeline: Timeline;
  sector_impacts: SectorImpact[];
  debate_participants: Participant[];
  metadata: SimulationMetadata;
}

export interface MutationResponse {
  mutation_id: string;
  divergence_nodes: string[];
  updated_nodes: SimulationNode[];
  updated_edges: SimulationEdge[];
  updated_timeline: Timeline;
  updated_sector_impacts: SectorImpact[];
  mutation_summary: string;
  simulation: SimulationResponse;
}

export interface DebateResponse {
  debate_id: string;
  participants: Participant[];
  messages: DebateMessage[];
}

export type DurationKey = "immediate" | "short_term" | "long_term";
export type TabKey = "flowchart" | "impacts" | "debate";
