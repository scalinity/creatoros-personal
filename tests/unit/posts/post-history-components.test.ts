import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { PostHistoryView } from "@/components/posts";

const posts = [
  {
    authorUsername: "ada_writes",
    bookmarkCount: 5,
    createdAt: "2026-04-27T13:00:00.000Z",
    format: "single",
    hasLink: false,
    hasMedia: true,
    heuristicScore: 61,
    hookType: "question",
    id: "post-1",
    impressionCount: 1000,
    isOwnerPost: true,
    likeCount: 20,
    platformPostId: "101",
    quoteCount: 2,
    replyCount: 4,
    repostCount: 6,
    source: "manual",
    text: "What if the best growth strategy is posting fewer, sharper ideas?",
    topic: "AI",
    viralityScore: 3.8,
  },
];

const aggregate = [
  {
    averageEngagementScore: 5.4,
    averageHeuristicScore: 61,
    averageViralityScore: 3.8,
    count: 1,
    key: "AI",
    label: "AI",
    topPostId: "post-1",
    totalEngagements: 37,
    totalImpressions: 1000,
  },
];

describe("PostHistoryView", () => {
  it("renders filters, add/import forms, post rows, aggregates, and the selected inspector", () => {
    const markup = renderToStaticMarkup(
      React.createElement(PostHistoryView, {
        aggregates: {
          dayOfWeek: aggregate,
          format: aggregate,
          hour: aggregate,
          topic: aggregate,
        },
        filters: { q: "", sort: "newest" },
        posts,
        selectedPost: posts[0],
      }),
    );

    expect(markup).toContain("post-history-page");
    expect(markup).toContain("Add manual post");
    expect(markup).toContain("Import CSV / JSON");
    expect(markup).toContain("name=\"performance\"");
    expect(markup).toContain("post-row post-row-selected");
    expect(markup).toContain("Score explanation");
    expect(markup).toContain("Edit metrics");
    expect(markup).toContain("Aggregates");
    expect(markup).not.toContain("pending implementation");
  });
});
