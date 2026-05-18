import { describe, expect, it } from "vitest";

import { parseStructuredJson } from "@/lib/ai/json";
import { z } from "zod";

const payloadSchema = z.object({
  confidence: z.enum(["fact", "inference", "speculation", "mixed"]),
  title: z.string(),
  scores: z.array(z.number()),
});

describe("AI structured JSON parsing", () => {
  it("parses fenced JSON into a validated object", () => {
    const result = parseStructuredJson(
      "```json\n{\"title\":\"Draft\",\"confidence\":\"fact\",\"scores\":[1,2,3]}\n```",
      payloadSchema,
    );

    expect(result).toEqual({ confidence: "fact", scores: [1, 2, 3], title: "Draft" });
  });

  it("repairs common trailing comma syntax once before validation", () => {
    const result = parseStructuredJson(
      '{"title":"Draft","confidence":"inference","scores":[1,2,],}',
      payloadSchema,
    );

    expect(result.scores).toEqual([1, 2]);
    expect(result.confidence).toBe("inference");
  });

  it("throws a schema-tagged error for invalid structured output", () => {
    expect(() => parseStructuredJson('{"title":"Draft","confidence":"guess","scores":[]}', payloadSchema)).toThrow(
      /ai_invalid_output/,
    );
  });

  it("throws a syntax-tagged error when JSON repair cannot recover the payload", () => {
    // M-12: brace-balancing recovers truncated arrays/objects, so the input
    // here is non-JSON instead of just truncated. The earlier truncated input
    // {"title":"Draft","confidence":"fact","scores":[1, is now repaired to
    // {"title":"Draft","confidence":"fact","scores":[1]}, which IS valid.
    expect(() => parseStructuredJson("not even close to json", payloadSchema)).toThrow(
      /ai_invalid_output: Provider returned invalid JSON syntax/,
    );
  });

  it("recovers truncated arrays via brace-balancing repair", () => {
    // M-12 regression: max_tokens-truncated output should parse now that the
    // JSON repair pipeline includes a brace-balancing pass.
    const result = parseStructuredJson('{"title":"Draft","confidence":"fact","scores":[1,', payloadSchema);
    expect(result).toEqual({ confidence: "fact", scores: [1], title: "Draft" });
  });
});
