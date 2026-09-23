import { z } from "zod";

/** Normalise any natural-language relationship word the LLM might produce. */
function normaliseRelationship(val: string): string {
  const v = val.toLowerCase().trim();
  if (v === 'block' || v === 'blocks') return 'block';
  if (["increase", "increases", "boost", "boosts", "accelerate", "accelerates", "grow", "grows", "expand", "expands", "support", "supports", "strengthen", "strengthens", "enable", "enables"].includes(v)) return "increase";
  if (["decrease", "decreases", "reduce", "reduces", "decline", "declines", "lower", "lowers", "shrink", "shrinks", "block", "blocks", "restrict", "restricts", "limit", "limits"].includes(v)) return "decrease";
  if (["transform", "transforms", "shift", "shifts", "change", "changes", "alter", "alters", "reshape", "reshapes"].includes(v)) return "transform";
  if (["destabilize", "destabilises", "disrupt", "disrupts", "undermine", "undermines", "weaken", "weakens", "erode", "erodes"].includes(v)) return "destabilize";
  if (["cause", "causes", "drive", "drives", "trigger", "triggers", "lead", "leads", "create", "creates", "generate", "generates"].includes(v)) return "enable";
  return val; // pass-through and let enum catch it
}

/**
 * A directed edge between two simulation nodes.
 * Represents a causal relationship.
 */
export const EdgeSchema = z.object({
  id: z.string().min(1, "Edge id required"),
  source: z.string().min(1, "Edge source required"),
  target: z.string().min(1, "Edge target required"),
  relationship: z
    .string()
    .transform(normaliseRelationship)
    .pipe(z.enum(["increase", "decrease", "transform", "destabilize", "enable", "block"])),
  strength: z.number().min(0).max(1),
  explanation: z.string().min(1),
});

export type Edge = z.infer<typeof EdgeSchema>;
