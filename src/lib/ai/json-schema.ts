import { z } from "zod";
import { makePatchSchema } from "./patch.ts";

// The patch schema in JSON Schema form, for Groq's strict structured outputs
// (https://console.groq.com/docs/structured-outputs): every property required,
// optional values as nullable, and additionalProperties false on every object.
export function patchJsonSchema(tags: readonly string[]) {
  return z.toJSONSchema(makePatchSchema(tags), { target: "draft-7" });
}
