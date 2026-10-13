import "server-only";
import { z } from "zod";

// Server-only configuration. "server-only" makes the build fail if this file is ever imported
// into browser code, so these values can't reach the client bundle. None of them use the
// NEXT_PUBLIC_ prefix, which is what would expose them. Each feature is parsed on its own, so a
// bad value for one never switches off the other.

const groqSchema = z.object({
  GROQ_API_KEY: z.string().min(20),
  GROQ_MODEL: z.string().regex(/^[\w./-]{3,80}$/),
});
const groq = groqSchema.safeParse({ GROQ_API_KEY: process.env.GROQ_API_KEY, GROQ_MODEL: process.env.GROQ_MODEL });

// AI search is optional: without both values, the app uses the keyword fallback.
export function groqConfig(): { apiKey: string; model: string } | null {
  return groq.success ? { apiKey: groq.data.GROQ_API_KEY, model: groq.data.GROQ_MODEL } : null;
}

const twitchSchema = z.object({
  TWITCH_CLIENT_ID: z.string().regex(/^[a-z0-9]{10,60}$/),
  TWITCH_CLIENT_SECRET: z.string().regex(/^[a-z0-9]{10,60}$/),
});
const twitch = twitchSchema.safeParse({
  TWITCH_CLIENT_ID: process.env.TWITCH_CLIENT_ID,
  TWITCH_CLIENT_SECRET: process.env.TWITCH_CLIENT_SECRET,
});

// Searching all PC games (IGDB, via a Twitch app) is optional too: without it, name
// suggestions come from CheapShark's store data only.
export function igdbConfig(): { clientId: string; clientSecret: string } | null {
  return twitch.success ? { clientId: twitch.data.TWITCH_CLIENT_ID, clientSecret: twitch.data.TWITCH_CLIENT_SECRET } : null;
}
