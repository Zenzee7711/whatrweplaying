import "server-only";
import { z } from "zod";

// Server-only configuration. "server-only" makes the build fail if this file is ever imported
// into browser code, so these values can't reach the client bundle. None of them use the
// NEXT_PUBLIC_ prefix, which is what would expose them.

const envSchema = z.object({
  GROQ_API_KEY: z.string().min(20).optional(),
  GROQ_MODEL: z.string().regex(/^[\w./-]{3,80}$/).optional(),
});

const parsed = envSchema.safeParse({
  GROQ_API_KEY: process.env.GROQ_API_KEY || undefined,
  GROQ_MODEL: process.env.GROQ_MODEL || undefined,
});

// AI search is optional: without both values, the app uses the keyword fallback.
export function groqConfig(): { apiKey: string; model: string } | null {
  if (!parsed.success || !parsed.data.GROQ_API_KEY || !parsed.data.GROQ_MODEL) return null;
  return { apiKey: parsed.data.GROQ_API_KEY, model: parsed.data.GROQ_MODEL };
}
