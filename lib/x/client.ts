import "server-only";

export type XPostMetrics = {
  bookmarkCount: null | number;
  impressionCount: null | number;
  likeCount: null | number;
  mediaViewCount: null | number;
  profileClickCount: null | number;
  quoteCount: null | number;
  replyCount: null | number;
  repostCount: null | number;
  urlLinkClickCount: null | number;
  videoViewCount: null | number;
};

export type XAuthenticatedUser = {
  avatarUrl: null | string;
  displayName: null | string;
  id: string;
  username: string;
};

export type XSyncPost = {
  authorDisplayName: null | string;
  authorUsername: null | string;
  createdAt: null | string;
  id: string;
  lang: null | string;
  media?: unknown[];
  metrics: XPostMetrics;
  raw: Record<string, unknown>;
  text: string;
};

export type XListPostsInput = {
  includeMetrics: boolean;
  maxPosts: number;
};

export type XListPostsResult = {
  posts: XSyncPost[];
  rateLimitResetAt: null | string;
};

export type XApiClient = {
  getAuthenticatedUser(): Promise<XAuthenticatedUser>;
  listUserPosts(userId: string, input: XListPostsInput): Promise<XListPostsResult>;
};

export class XApiError extends Error {
  override name = "XApiError";

  constructor(
    message: string,
    readonly details: {
      code: string;
      rateLimitResetAt?: null | string;
      retryable: boolean;
      status: number;
    },
  ) {
    super(message);
  }
}

type FetchImpl = typeof fetch;

type XUserPayload = {
  data?: {
    id?: string;
    name?: string;
    profile_image_url?: string;
    username?: string;
  };
};

type XTweetPayload = {
  data?: Array<Record<string, unknown>>;
  errors?: unknown[];
  includes?: {
    media?: Array<Record<string, unknown>>;
  };
  meta?: Record<string, unknown>;
};

const X_API_BASE = "https://api.x.com/2";

function numberMetric(value: unknown): null | number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? Math.trunc(value) : null;
}

function stringValue(value: unknown): null | string {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function parseRateLimitReset(response: Response) {
  const reset = response.headers.get("x-rate-limit-reset");
  const resetSeconds = reset ? Number(reset) : NaN;

  if (!Number.isFinite(resetSeconds)) {
    return null;
  }

  return new Date(resetSeconds * 1_000).toISOString();
}

async function parseJsonResponse(response: Response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

async function requestJson(accessToken: string, path: string, fetchImpl: FetchImpl) {
  const response = await fetchImpl(`${X_API_BASE}${path}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
    },
  });
  const payload = await parseJsonResponse(response);

  if (!response.ok) {
    const rateLimitResetAt = parseRateLimitReset(response);
    const retryable = response.status === 429 || response.status >= 500;
    throw new XApiError(`X API request failed with status ${response.status}.`, {
      code: response.status === 429 ? "rate_limited" : "x_api_error",
      rateLimitResetAt,
      retryable,
      status: response.status,
    });
  }

  return { payload, rateLimitResetAt: parseRateLimitReset(response) };
}

function parseUserPayload(payload: unknown): XAuthenticatedUser {
  const data = objectValue((payload as XUserPayload | null)?.data);
  const id = stringValue(data.id);
  const username = stringValue(data.username);

  if (!id || !username) {
    throw new Error("X user response was missing id or username.");
  }

  return {
    avatarUrl: stringValue(data.profile_image_url),
    displayName: stringValue(data.name),
    id,
    username,
  };
}

function metricFromSources(tweet: Record<string, unknown>, key: string) {
  const publicMetrics = objectValue(tweet.public_metrics);
  const nonPublicMetrics = objectValue(tweet.non_public_metrics);
  const organicMetrics = objectValue(tweet.organic_metrics);
  const promotedMetrics = objectValue(tweet.promoted_metrics);

  return numberMetric(publicMetrics[key]) ?? numberMetric(nonPublicMetrics[key]) ?? numberMetric(organicMetrics[key]) ?? numberMetric(promotedMetrics[key]);
}

function parseTweet(tweet: Record<string, unknown>, mediaByKey: Map<string, Record<string, unknown>> = new Map()): null | XSyncPost {
  const id = stringValue(tweet.id);
  const text = stringValue(tweet.text);

  if (!id || !text) {
    return null;
  }

  const attachments = objectValue(tweet.attachments);
  const mediaKeys = Array.isArray(attachments.media_keys) ? attachments.media_keys.filter((key): key is string => typeof key === "string") : [];
  const media = mediaKeys.map((key) => mediaByKey.get(key)).filter((item): item is Record<string, unknown> => Boolean(item));

  return {
    authorDisplayName: null,
    authorUsername: null,
    createdAt: stringValue(tweet.created_at),
    id,
    lang: stringValue(tweet.lang),
    media,
    metrics: {
      bookmarkCount: metricFromSources(tweet, "bookmark_count"),
      impressionCount: metricFromSources(tweet, "impression_count"),
      likeCount: metricFromSources(tweet, "like_count"),
      mediaViewCount: metricFromSources(tweet, "media_view_count"),
      profileClickCount: metricFromSources(tweet, "user_profile_clicks") ?? metricFromSources(tweet, "profile_click_count"),
      quoteCount: metricFromSources(tweet, "quote_count"),
      replyCount: metricFromSources(tweet, "reply_count"),
      repostCount: metricFromSources(tweet, "retweet_count") ?? metricFromSources(tweet, "repost_count"),
      urlLinkClickCount: metricFromSources(tweet, "url_link_clicks") ?? metricFromSources(tweet, "url_link_click_count"),
      videoViewCount: metricFromSources(tweet, "video_view_count"),
    },
    raw: {
      ...tweet,
      ...(media.length > 0 ? { includes_media: media } : {}),
    },
    text,
  };
}

export function createLiveXApiClient(accessToken: string, options: { fetchImpl?: FetchImpl } = {}): XApiClient {
  const fetchImpl = options.fetchImpl ?? fetch;

  return {
    async getAuthenticatedUser() {
      const params = new URLSearchParams({
        "user.fields": "id,name,username,profile_image_url",
      });
      const { payload } = await requestJson(accessToken, `/users/me?${params.toString()}`, fetchImpl);
      return parseUserPayload(payload);
    },

    async listUserPosts(userId, input) {
      const requested = Math.max(5, Math.min(100, input.maxPosts));
      const tweetFields = [
        "attachments",
        "author_id",
        "conversation_id",
        "created_at",
        "in_reply_to_user_id",
        "lang",
        "possibly_sensitive",
        "public_metrics",
        "referenced_tweets",
      ];

      if (input.includeMetrics) {
        tweetFields.push("non_public_metrics", "organic_metrics", "promoted_metrics");
      }

      const params = new URLSearchParams({
        expansions: "attachments.media_keys",
        max_results: String(requested),
        "media.fields": "duration_ms,height,media_key,preview_image_url,type,url,width,public_metrics,alt_text",
        "tweet.fields": tweetFields.join(","),
      });
      const { payload, rateLimitResetAt } = await requestJson(accessToken, `/users/${encodeURIComponent(userId)}/tweets?${params.toString()}`, fetchImpl);
      const typedPayload = payload as XTweetPayload | null;
      const rawPosts = Array.isArray(typedPayload?.data) ? (typedPayload.data ?? []) : [];
      const mediaByKey = new Map(
        (typedPayload?.includes?.media ?? [])
          .map((media) => [stringValue(media.media_key), media] as const)
          .filter((entry): entry is readonly [string, Record<string, unknown>] => Boolean(entry[0])),
      );
      const posts = rawPosts.map((tweet) => parseTweet(tweet, mediaByKey)).filter((post): post is XSyncPost => Boolean(post)).slice(0, input.maxPosts);

      return { posts, rateLimitResetAt };
    },
  };
}

export function createMockXApiClient(posts: XSyncPost[] = []): XApiClient {
  const fixturePosts = posts.length > 0 ? posts : [
    {
      authorDisplayName: "CreatorOS Personal",
      authorUsername: "creatoros",
      createdAt: new Date("2026-04-28T14:00:00.000Z").toISOString(),
      id: "mock-x-post-1",
      lang: "en",
      metrics: {
        bookmarkCount: 4,
        impressionCount: 1800,
        likeCount: 72,
        mediaViewCount: null,
        profileClickCount: null,
        quoteCount: 3,
        replyCount: 9,
        repostCount: 14,
        urlLinkClickCount: null,
        videoViewCount: null,
      },
      raw: {
        id: "mock-x-post-1",
        mock: true,
        public_metrics: {
          bookmark_count: 4,
          impression_count: 1800,
          like_count: 72,
          quote_count: 3,
          reply_count: 9,
          retweet_count: 14,
        },
      },
      text: "Mock X sync post for explicit dry-run validation.",
    },
  ];

  return {
    async getAuthenticatedUser() {
      return {
        avatarUrl: null,
        displayName: "CreatorOS Personal",
        id: "mock-x-user",
        username: "creatoros",
      };
    },
    async listUserPosts(_userId, input) {
      return {
        posts: fixturePosts.slice(0, input.maxPosts),
        rateLimitResetAt: null,
      };
    },
  };
}
