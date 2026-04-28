import { describe, expect, it } from "vitest";

import { parseManualPostInput, parsePostsCsv, parsePostsJson } from "@/lib/imports";

describe("manual post input parsing", () => {
  it("normalizes manual post fields and metrics", () => {
    const result = parseManualPostInput({
      author_username: " @Ada_Writes ",
      created_at_platform: "2026-04-27T13:00:00.000Z",
      has_link: "true",
      has_media: "false",
      impression_count: "1000",
      is_owner_post: "true",
      like_count: "20",
      platform_post_id: "  12345 ",
      reply_count: "4",
      repost_count: "6",
      source: "manual",
      text: "  Most systems get better when you remove one brittle assumption.  ",
      topic: "Systems",
    });

    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.post).toMatchObject({
      authorUsername: "Ada_Writes",
      hasLink: true,
      hasMedia: false,
      isOwnerPost: true,
      metrics: {
        impressionCount: 1000,
        likeCount: 20,
        replyCount: 4,
        repostCount: 6,
      },
      platformPostId: "12345",
      source: "manual",
      text: "Most systems get better when you remove one brittle assumption.",
      topic: "Systems",
    });
  });

  it("rejects blank text and negative metrics", () => {
    const result = parseManualPostInput({ like_count: "-1", text: "   " });

    expect(result.success).toBe(false);
    if (result.success) return;

    expect(result.errors.map((error) => error.field)).toEqual(["text", "like_count"]);
  });
});

describe("CSV post import parsing", () => {
  it("parses valid CSV rows with aliases and missing optional metrics", () => {
    const csv = [
      "tweet_id,text,created_at,impressions,likes,replies,reposts,quotes,bookmarks,topic,format,has_media",
      "101,\"A hook, with a comma\",2026-04-27T13:00:00.000Z,1000,20,4,6,2,5,AI,single,true",
      "102,Second row,2026-04-28T14:00:00.000Z,,7,,,,,Systems,thread,false",
    ].join("\n");

    const result = parsePostsCsv(csv);

    expect(result.posts).toHaveLength(2);
    expect(result.errors).toEqual([]);
    expect(result.posts[0]).toMatchObject({
      platformPostId: "101",
      text: "A hook, with a comma",
      metrics: {
        bookmarkCount: 5,
        impressionCount: 1000,
        likeCount: 20,
        quoteCount: 2,
        replyCount: 4,
        repostCount: 6,
      },
      topic: "AI",
      format: "single",
      hasMedia: true,
    });
    expect(result.posts[1]?.metrics.impressionCount).toBe(0);
  });

  it("reports malformed rows, duplicates, and invalid metrics without trusting external text", () => {
    const csv = [
      "id,text,likes",
      "201,First post,1",
      "201,Duplicate post,2",
      "202,Bad metric,-4",
      "203,\"unterminated,7",
    ].join("\n");

    const result = parsePostsCsv(csv);

    expect(result.posts).toHaveLength(1);
    expect(result.errors.map((error) => error.code)).toEqual([
      "duplicate_platform_post_id",
      "validation_error",
      "malformed_csv",
    ]);
    expect(result.posts[0]?.metadata).toMatchObject({ untrusted_import_text: true });
  });
});

describe("JSON post import parsing", () => {
  it("parses arrays and archive-like tweet payloads", () => {
    const result = parsePostsJson(
      JSON.stringify({
        tweets: [
          {
            tweet: {
              created_at: "2026-04-27T13:00:00.000Z",
              favorite_count: "20",
              full_text: "Archive row text",
              id_str: "301",
              retweet_count: "6",
            },
          },
        ],
      }),
    );

    expect(result.errors).toEqual([]);
    expect(result.posts).toHaveLength(1);
    expect(result.posts[0]).toMatchObject({
      createdAtPlatform: "2026-04-27T13:00:00.000Z",
      metrics: {
        likeCount: 20,
        repostCount: 6,
      },
      platformPostId: "301",
      text: "Archive row text",
    });
  });

  it("reports invalid JSON and duplicate ids", () => {
    expect(parsePostsJson("not json").errors[0]?.code).toBe("invalid_json");

    const result = parsePostsJson(
      JSON.stringify([
        { id: "401", text: "First" },
        { id: "401", text: "Duplicate" },
      ]),
    );

    expect(result.posts).toHaveLength(1);
    expect(result.errors[0]).toMatchObject({ code: "duplicate_platform_post_id", row: 2 });
  });
});
