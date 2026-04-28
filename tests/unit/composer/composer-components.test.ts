import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ComposerWorkspaceView } from "@/components/composer";
import type { ComposerIdea, ComposerOutput } from "@/lib/content";

const idea = {
  createdAt: "2026-04-28T12:00:00.000Z",
  favorite: true,
  id: "idea-1",
  linkedPostId: "post-1",
  rawText: "Turn a strong post-history lesson into a concise X post.",
  source: "manual",
  sourceEntityId: "post-1",
  sourceEntityType: "post",
  status: "active",
  tags: ["scoring", "systems"],
  title: "Scoring lesson",
  updatedAt: "2026-04-28T12:30:00.000Z",
} satisfies ComposerIdea;

const output = {
  archivedAt: null,
  copiedAt: "2026-04-28T12:45:00.000Z",
  createdAt: "2026-04-28T12:40:00.000Z",
  favorite: false,
  id: "output-1",
  inputId: "idea-1",
  inputType: "content_idea",
  model: null,
  promptVersion: null,
  provider: null,
  saved: true,
  text: "Ship the system that makes good ideas easier to reuse.",
  type: "x_post",
  updatedAt: "2026-04-28T12:45:00.000Z",
  variants: [{ text: "Alternative" }],
} satisfies ComposerOutput;

describe("ComposerWorkspaceView", () => {
  it("renders idea inbox, source inspector, forms, and generated output actions", () => {
    const markup = renderToStaticMarkup(
      React.createElement(ComposerWorkspaceView, {
        filters: { status: "active" },
        ideas: [idea],
        notice: "idea_created",
        outputs: [output],
        selectedIdea: idea,
      }),
    );

    expect(markup).toContain("composer-page");
    expect(markup).toContain("Content composer");
    expect(markup).toContain("Idea inbox");
    expect(markup).toContain("Create idea");
    expect(markup).toContain("Source inspector");
    expect(markup).toContain("Generated outputs");
    expect(markup).toContain("Ship the system");
    expect(markup).toContain("Mark copied");
    expect(markup).toContain("Publishing handoff");
    expect(markup).toContain("Create publishing draft");
    expect(markup).toContain('name="source_type" value="generated_output"');
    expect(markup).toContain('name="source_type" value="content_idea"');
    expect(markup).not.toContain("pending implementation");
  });

  it("renders empty data states without hiding the create idea form", () => {
    const markup = renderToStaticMarkup(
      React.createElement(ComposerWorkspaceView, {
        filters: {},
        ideas: [],
        outputs: [],
        selectedIdea: null,
      }),
    );

    expect(markup).toContain("No ideas in this view");
    expect(markup).toContain("Create idea");
    expect(markup).toContain("No generated outputs yet");
  });
});
