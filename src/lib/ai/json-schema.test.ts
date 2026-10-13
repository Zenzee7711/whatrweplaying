import { describe, expect, it } from "vitest";
import { patchJsonSchema } from "./json-schema.ts";

type Node = {
  type?: string | string[];
  properties?: Record<string, Node>;
  required?: string[];
  additionalProperties?: unknown;
  anyOf?: Node[];
  items?: Node;
  enum?: unknown[];
};

// Collects every place that breaks Groq's strict-mode rules.
function strictProblems(node: Node, path = "root"): string[] {
  const problems: string[] = [];
  if (node.type === "object") {
    if (node.additionalProperties !== false) problems.push(`${path}: additionalProperties must be false`);
    for (const key of Object.keys(node.properties ?? {})) {
      if (!node.required?.includes(key)) problems.push(`${path}.${key}: must be required`);
      problems.push(...strictProblems(node.properties![key], `${path}.${key}`));
    }
  }
  for (const option of node.anyOf ?? []) problems.push(...strictProblems(option, path));
  if (node.items) problems.push(...strictProblems(node.items, `${path}[]`));
  return problems;
}

describe("patchJsonSchema", () => {
  const schema = patchJsonSchema(["horror", "puzzle"], ["overcooked-2", "valheim"]) as Node;

  it("meets Groq's strict structured-output rules", () => {
    expect(strictProblems(schema)).toEqual([]);
  });

  it("limits tags to the catalogue's vocabulary", () => {
    expect(schema.properties!.addPreferred.items!.enum).toEqual(["horror", "puzzle"]);
  });
});
