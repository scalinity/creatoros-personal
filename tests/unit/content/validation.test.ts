import { describe, expect, it } from "vitest";

import {
  contentIdeaCreateSchema,
  contentIdeaUpdateSchema,
  formDataToContentRecord,
  generatedOutputCreateSchema,
  generatedOutputStatusActionSchema,
  parseTagInput,
} from "@/lib/content/validation";

describe("content workspace validation", () => {
  it("normalizes tag input and linked source fields for idea creation", () => {
    const result = contentIdeaCreateSchema.safeParse({
      linked_post_id: "550e8400-e29b-41d4-a716-446655440000",
      raw_text: "  Turn the import scoring lessons into a sharper post. ",
      source: "manual",
      source_entity_id: "550e8400-e29b-41d4-a716-446655440001",
      source_entity_type: "post",
      status: "active",
      tags: " scoring, systems, scoring ",
      title: "  Scoring angle ",
    });

    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.data).toMatchObject({
      linkedPostId: "550e8400-e29b-41d4-a716-446655440000",
      rawText: "Turn the import scoring lessons into a sharper post.",
      source: "manual",
      sourceEntityId: "550e8400-e29b-41d4-a716-446655440001",
      sourceEntityType: "post",
      status: "active",
      tags: ["scoring", "systems"],
      title: "Scoring angle",
    });
  });

  it("rejects blank ideas and unsupported source entity types", () => {
    const result = contentIdeaCreateSchema.safeParse({
      raw_text: "   ",
      source_entity_type: "customer",
    });

    expect(result.success).toBe(false);
    if (result.success) return;

    expect(result.error.issues.map((issue) => issue.path.join("."))).toContain("raw_text");
    expect(result.error.issues.map((issue) => issue.path.join("."))).toContain("source_entity_type");
  });

  it("supports partial idea updates without erasing omitted fields", () => {
    const result = contentIdeaUpdateSchema.safeParse({
      favorite: "true",
      id: "idea-1",
      status: "drafted",
      tags: ["x", "blog", "x"],
    });

    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.data).toEqual({
      favorite: true,
      id: "idea-1",
      status: "drafted",
      tags: ["x", "blog"],
    });
  });

  it("normalizes blank optional source and input select values to null", () => {
    const idea = contentIdeaCreateSchema.parse({
      linked_post_id: "",
      raw_text: "Keep this idea without a linked source yet.",
      source_entity_id: "",
      source_entity_type: "",
    });

    expect(idea.linkedPostId).toBeNull();
    expect(idea.sourceEntityId).toBeNull();
    expect(idea.sourceEntityType).toBeNull();

    const output = generatedOutputCreateSchema.parse({
      input_id: "",
      input_type: "",
      text: "Stored output without a source link.",
      type: "manual",
    });

    expect(output.inputId).toBeNull();
    expect(output.inputType).toBeNull();
  });

  it("validates generated output creation and status actions", () => {
    const output = generatedOutputCreateSchema.safeParse({
      input_id: "550e8400-e29b-41d4-a716-446655440000",
      input_type: "content_idea",
      metadata: { phase: "10" },
      saved: "true",
      text: "  A generated draft kept for later. ",
      type: "x_post",
      variants: [{ text: "Alt" }],
    });

    expect(output.success).toBe(true);
    if (!output.success) return;

    expect(output.data.saved).toBe(true);
    expect(output.data.inputType).toBe("content_idea");
    expect(output.data.text).toBe("A generated draft kept for later.");

    const action = generatedOutputStatusActionSchema.parse({
      action: "copied",
      id: "out-1",
    });

    expect(action).toEqual({ action: "copied", id: "out-1" });
  });

  it("converts form data into a plain string record", () => {
    const formData = new FormData();
    formData.set("raw_text", "Idea");
    formData.set("tags", "one, two");

    expect(formDataToContentRecord(formData)).toEqual({ raw_text: "Idea", tags: "one, two" });
    expect(parseTagInput("one, two\nthree")).toEqual(["one", "two", "three"]);
  });
});
