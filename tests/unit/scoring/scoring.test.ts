import { describe, expect, it } from "vitest";

import {
  aggregateByDayOfWeek,
  aggregateByFormat,
  aggregateByHour,
  aggregateByTopic,
  calculateEngagementScore,
  calculateMetricVelocity,
  calculateRecencyAdjustedScore,
  calculateViralityScore,
  classifyPerformanceBucket,
  classifyPostLengthBucket,
  detectPossibleFormat,
  detectPossibleHookType,
} from "@/lib/scoring";

describe("deterministic post scoring", () => {
  it("calculates impression-based engagement and virality rates", () => {
    const metrics = {
      bookmarkCount: 5,
      impressionCount: 1000,
      likeCount: 20,
      profileClickCount: 3,
      quoteCount: 2,
      replyCount: 4,
      repostCount: 6,
      urlLinkClickCount: 1,
    };

    expect(calculateEngagementScore(metrics)).toBe(5.4);
    expect(calculateViralityScore(metrics)).toBe(3.8);
  });

  it("falls back to raw engagement when impressions are unavailable", () => {
    expect(
      calculateEngagementScore({
        bookmarkCount: 3,
        impressionCount: 0,
        likeCount: 12,
        quoteCount: 1,
        replyCount: 2,
        repostCount: 4,
      }),
    ).toBe(14.77);

    expect(calculateViralityScore({ impressionCount: null, quoteCount: 1, replyCount: 2, repostCount: 4 })).toBe(8.28);
  });

  it("applies exponential recency decay and computes metric velocity between snapshots", () => {
    expect(
      calculateRecencyAdjustedScore({
        halfLifeDays: 30,
        now: new Date("2026-04-28T00:00:00.000Z"),
        score: 80,
        timestamp: "2026-03-29T00:00:00.000Z",
      }),
    ).toBe(40);

    expect(
      calculateMetricVelocity({
        current: {
          impressionCount: 460,
          likeCount: 42,
          replyCount: 8,
          repostCount: 12,
          snapshotAt: "2026-04-28T12:00:00.000Z",
        },
        previous: {
          impressionCount: 100,
          likeCount: 6,
          replyCount: 2,
          repostCount: 3,
          snapshotAt: "2026-04-28T00:00:00.000Z",
        },
      }),
    ).toMatchObject({
      engagementVelocityPerHour: 4.25,
      hoursElapsed: 12,
      impressionVelocityPerHour: 30,
      likeVelocityPerHour: 3,
      repostVelocityPerHour: 0.75,
    });
  });

  it("classifies length and performance buckets", () => {
    expect(classifyPostLengthBucket("short hook")).toBe("micro");
    expect(classifyPostLengthBucket("x".repeat(140))).toBe("short");
    expect(classifyPostLengthBucket("x".repeat(240))).toBe("standard");
    expect(classifyPostLengthBucket("x".repeat(600))).toBe("long");
    expect(classifyPostLengthBucket("x".repeat(1200))).toBe("essay");

    expect(classifyPerformanceBucket(null)).toBe("unknown");
    expect(classifyPerformanceBucket(12)).toBe("low");
    expect(classifyPerformanceBucket(42)).toBe("steady");
    expect(classifyPerformanceBucket(64)).toBe("strong");
    expect(classifyPerformanceBucket(88)).toBe("breakout");
  });

  it("aggregates performance by topic, format, day, and hour", () => {
    const posts = [
      {
        createdAt: "2026-04-27T13:00:00.000Z",
        format: "single",
        heuristicScore: 60,
        id: "p1",
        impressionCount: 1000,
        likeCount: 20,
        quoteCount: 2,
        replyCount: 4,
        repostCount: 6,
        topic: "AI",
        viralityScore: 3.8,
      },
      {
        createdAt: "2026-04-27T17:30:00.000Z",
        format: "thread",
        heuristicScore: 90,
        id: "p2",
        impressionCount: 2000,
        likeCount: 60,
        quoteCount: 8,
        replyCount: 12,
        repostCount: 20,
        topic: "AI",
        viralityScore: 7.4,
      },
      {
        createdAt: "2026-04-28T13:00:00.000Z",
        format: null,
        heuristicScore: 30,
        id: "p3",
        impressionCount: 300,
        likeCount: 5,
        topic: null,
      },
    ];

    expect(aggregateByTopic(posts)[0]).toMatchObject({
      averageHeuristicScore: 75,
      count: 2,
      key: "AI",
      topPostId: "p2",
      totalImpressions: 3000,
    });
    expect(aggregateByTopic(posts)[1]?.key).toBe("Uncategorized");
    expect(aggregateByFormat(posts).map((group) => group.key)).toEqual(["single", "thread", "Uncategorized"]);
    expect(aggregateByDayOfWeek(posts).map((group) => group.key)).toEqual(["Monday", "Tuesday"]);
    expect(aggregateByHour(posts).map((group) => group.key)).toEqual(["13", "17"]);
  });

  it("detects hook and format placeholders deterministically without AI", () => {
    expect(detectPossibleHookType("What if the best growth strategy is posting less?")).toBe("question");
    expect(detectPossibleHookType("Everyone says post daily, but cadence is a trap.")).toBe("contrarian");
    expect(detectPossibleFormat("1. Start with the scar\n2. Show the system\n3. Ask for the reply")).toBe("thread");
    expect(detectPossibleFormat("Tiny observation, one clean idea.")).toBe("single");
  });
});
