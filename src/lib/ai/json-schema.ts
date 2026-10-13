import { z } from "zod";
import { wirePatchSchema } from "./patch.ts";

// The reply schema in JSON Schema form, for Groq's strict structured outputs
// (https://console.groq.com/docs/structured-outputs): every property required,
// optional values as nullable, and additionalProperties false on every object.
// Tags and game IDs are plain strings here (the allowed values are listed in the prompt);
// fromWire() drops anything unknown afterwards.
export function patchJsonSchema() {
  return z.toJSONSchema(wirePatchSchema, { target: "draft-7" });
}
