export type ImportSource = "import" | "manual" | "x_api";

export type NormalizedPostMetrics = {
  bookmarkCount: number;
  impressionCount: number;
  likeCount: number;
  mediaViewCount: number;
  profileClickCount: number;
  quoteCount: number;
  replyCount: number;
  repostCount: number;
  urlLinkClickCount: number;
  videoViewCount: number;
};

export type NormalizedPostInput = {
  authorDisplayName: null | string;
  authorUsername: null | string;
  contentPillar: null | string;
  createdAtPlatform: null | string;
  format: null | string;
  hasLink: boolean;
  hasMedia: boolean;
  hookType: null | string;
  isOwnerPost: boolean;
  metadata: Record<string, unknown>;
  metrics: NormalizedPostMetrics;
  platform: string;
  platformPostId: null | string;
  rawRecord: Record<string, unknown>;
  source: ImportSource | string;
  text: string;
  tone: null | string;
  topic: null | string;
  url: null | string;
};

export type ImportParseError = {
  code: "duplicate_platform_post_id" | "invalid_json" | "malformed_csv" | "validation_error";
  field?: string;
  message: string;
  row?: number;
};

export type ManualPostParseResult =
  | { errors: ImportParseError[]; success: false }
  | { post: NormalizedPostInput; success: true };

export type ImportParseResult = {
  errors: ImportParseError[];
  posts: NormalizedPostInput[];
};

type CsvParseResult =
  | { rows: string[][]; success: true }
  | { errors: ImportParseError[]; rows: string[][]; success: false };

const metricAliases = {
  bookmarkCount: ["bookmark_count", "bookmarkCount", "bookmarks", "bookmark"],
  impressionCount: ["impression_count", "impressionCount", "impressions", "views", "view_count"],
  likeCount: ["like_count", "likeCount", "likes", "favorite_count", "favorites"],
  mediaViewCount: ["media_view_count", "mediaViewCount", "media_views"],
  profileClickCount: ["profile_click_count", "profileClickCount", "profile_clicks", "user_profile_clicks"],
  quoteCount: ["quote_count", "quoteCount", "quotes"],
  replyCount: ["reply_count", "replyCount", "replies"],
  repostCount: ["repost_count", "repostCount", "reposts", "retweets", "retweet_count"],
  urlLinkClickCount: ["url_link_click_count", "urlLinkClickCount", "url_clicks", "link_clicks"],
  videoViewCount: ["video_view_count", "videoViewCount", "video_views"],
} as const satisfies Record<keyof NormalizedPostMetrics, readonly string[]>;

function readField(record: Record<string, unknown>, aliases: readonly string[]) {
  for (const alias of aliases) {
    if (Object.prototype.hasOwnProperty.call(record, alias)) {
      return record[alias];
    }
  }

  return undefined;
}

function cleanString(value: unknown) {
  if (value === null || value === undefined) {
    return null;
  }

  const trimmed = String(value).trim();
  return trimmed.length > 0 ? trimmed : null;
}

function cleanUsername(value: unknown) {
  return cleanString(value)?.replace(/^@+/, "") ?? null;
}

function parseBoolean(value: unknown, fallback = false) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;

  const normalized = cleanString(value)?.toLowerCase();
  if (!normalized) return fallback;
  if (["1", "true", "yes", "y"].includes(normalized)) return true;
  if (["0", "false", "no", "n"].includes(normalized)) return false;
  return fallback;
}

function parseMetric(value: unknown, field: string, errors: ImportParseError[], row?: number) {
  const stringValue = cleanString(value);

  if (!stringValue) {
    return 0;
  }

  const normalized = stringValue.replaceAll(",", "");
  const numberValue = Number(normalized);

  if (!Number.isFinite(numberValue) || numberValue < 0 || !Number.isInteger(numberValue)) {
    errors.push({
      code: "validation_error",
      field,
      message: `${field} must be a non-negative integer.`,
      row,
    });
    return 0;
  }

  return numberValue;
}

function parseDate(value: unknown, field: string, errors: ImportParseError[], row?: number) {
  const dateValue = cleanString(value);

  if (!dateValue) {
    return null;
  }

  const date = new Date(dateValue);

  if (!Number.isFinite(date.getTime())) {
    errors.push({
      code: "validation_error",
      field,
      message: `${field} must be a valid date or timestamp.`,
      row,
    });
    return null;
  }

  return date.toISOString();
}

function parseMetrics(record: Record<string, unknown>, errors: ImportParseError[], row?: number): NormalizedPostMetrics {
  return {
    bookmarkCount: parseMetric(readField(record, metricAliases.bookmarkCount), "bookmark_count", errors, row),
    impressionCount: parseMetric(readField(record, metricAliases.impressionCount), "impression_count", errors, row),
    likeCount: parseMetric(readField(record, metricAliases.likeCount), "like_count", errors, row),
    mediaViewCount: parseMetric(readField(record, metricAliases.mediaViewCount), "media_view_count", errors, row),
    profileClickCount: parseMetric(readField(record, metricAliases.profileClickCount), "profile_click_count", errors, row),
    quoteCount: parseMetric(readField(record, metricAliases.quoteCount), "quote_count", errors, row),
    replyCount: parseMetric(readField(record, metricAliases.replyCount), "reply_count", errors, row),
    repostCount: parseMetric(readField(record, metricAliases.repostCount), "repost_count", errors, row),
    urlLinkClickCount: parseMetric(readField(record, metricAliases.urlLinkClickCount), "url_link_click_count", errors, row),
    videoViewCount: parseMetric(readField(record, metricAliases.videoViewCount), "video_view_count", errors, row),
  };
}

function normalizeRecord(record: Record<string, unknown>, options: { defaultSource: ImportSource | string; row?: number; untrusted: boolean }): ManualPostParseResult {
  const errors: ImportParseError[] = [];
  const text = cleanString(readField(record, ["text", "full_text", "content", "body"]));

  if (!text) {
    errors.push({ code: "validation_error", field: "text", message: "Post text is required.", row: options.row });
  } else if (text.length > 25_000) {
    errors.push({ code: "validation_error", field: "text", message: "Post text must be 25,000 characters or fewer.", row: options.row });
  }

  const metrics = parseMetrics(record, errors, options.row);
  const source = cleanString(readField(record, ["source"])) ?? options.defaultSource;
  const platform = cleanString(readField(record, ["platform"])) ?? "x";
  const createdAtPlatform = parseDate(
    readField(record, ["created_at_platform", "createdAtPlatform", "created_at", "timestamp", "date"]),
    "created_at_platform",
    errors,
    options.row,
  );

  if (errors.length > 0 || !text) {
    return { errors, success: false };
  }

  return {
    post: {
      authorDisplayName: cleanString(readField(record, ["author_display_name", "authorDisplayName", "display_name", "name"])),
      authorUsername: cleanUsername(readField(record, ["author_username", "authorUsername", "username", "author"])),
      contentPillar: cleanString(readField(record, ["content_pillar", "contentPillar", "pillar"])),
      createdAtPlatform,
      format: cleanString(readField(record, ["format", "post_format"])),
      hasLink: parseBoolean(readField(record, ["has_link", "hasLink", "contains_link"])),
      hasMedia: parseBoolean(readField(record, ["has_media", "hasMedia", "contains_media"])),
      hookType: cleanString(readField(record, ["hook_type", "hookType", "hook"])),
      isOwnerPost: parseBoolean(readField(record, ["is_owner_post", "isOwnerPost", "owner", "mine"]), true),
      metadata: options.untrusted ? { untrusted_import_text: true } : {},
      metrics,
      platform,
      platformPostId: cleanString(readField(record, ["platform_post_id", "platformPostId", "tweet_id", "id", "id_str"])),
      rawRecord: record,
      source,
      text,
      tone: cleanString(readField(record, ["tone"])),
      topic: cleanString(readField(record, ["topic", "category"])),
      url: cleanString(readField(record, ["url", "post_url", "tweet_url"])),
    },
    success: true,
  };
}

function parseCsvRows(input: string): CsvParseResult {
  const rows: string[][] = [];
  const currentRow: string[] = [];
  let currentCell = "";
  let inQuotes = false;

  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];
    const next = input[index + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        currentCell += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      currentRow.push(currentCell);
      currentCell = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") {
        index += 1;
      }
      currentRow.push(currentCell);
      rows.push([...currentRow]);
      currentRow.length = 0;
      currentCell = "";
      continue;
    }

    currentCell += char;
  }

  if (inQuotes) {
    return {
      errors: [{ code: "malformed_csv", message: "CSV contains an unterminated quoted field.", row: rows.length + 1 }],
      rows,
      success: false,
    };
  }

  currentRow.push(currentCell);
  rows.push([...currentRow]);

  return { rows, success: true };
}

function rowRecord(headers: string[], values: string[]) {
  return headers.reduce<Record<string, unknown>>((record, header, index) => {
    record[header] = values[index] ?? "";
    return record;
  }, {});
}

function collectUniquePosts(records: Record<string, unknown>[], options: { defaultSource: ImportSource; startRow: number; untrusted: boolean }) {
  const posts: NormalizedPostInput[] = [];
  const errors: ImportParseError[] = [];
  const platformIds = new Set<string>();

  records.forEach((record, index) => {
    const row = options.startRow + index;
    const parsed = normalizeRecord(record, { defaultSource: options.defaultSource, row, untrusted: options.untrusted });

    if (!parsed.success) {
      errors.push(...parsed.errors);
      return;
    }

    const duplicateKey = parsed.post.platformPostId ? `${parsed.post.platform}:${parsed.post.platformPostId}` : null;

    if (duplicateKey && platformIds.has(duplicateKey)) {
      errors.push({
        code: "duplicate_platform_post_id",
        field: "platform_post_id",
        message: "Duplicate platform post id in import payload.",
        row,
      });
      return;
    }

    if (duplicateKey) {
      platformIds.add(duplicateKey);
    }

    posts.push(parsed.post);
  });

  return { errors, posts };
}

function normalizeArchiveRecord(record: unknown): Record<string, unknown> | null {
  if (!record || typeof record !== "object" || Array.isArray(record)) {
    return null;
  }

  const objectRecord = record as Record<string, unknown>;
  const tweet = objectRecord.tweet;

  if (tweet && typeof tweet === "object" && !Array.isArray(tweet)) {
    return tweet as Record<string, unknown>;
  }

  return objectRecord;
}

function jsonRecords(payload: unknown): Record<string, unknown>[] {
  if (Array.isArray(payload)) {
    return payload.map(normalizeArchiveRecord).filter((record): record is Record<string, unknown> => Boolean(record));
  }

  if (!payload || typeof payload !== "object") {
    return [];
  }

  const objectPayload = payload as Record<string, unknown>;

  for (const key of ["posts", "data", "tweets"]) {
    const nested = objectPayload[key];
    if (Array.isArray(nested)) {
      return nested.map(normalizeArchiveRecord).filter((record): record is Record<string, unknown> => Boolean(record));
    }
  }

  const single = normalizeArchiveRecord(payload);
  return single ? [single] : [];
}

export function parseManualPostInput(input: Record<string, unknown>): ManualPostParseResult {
  return normalizeRecord(input, { defaultSource: "manual", untrusted: false });
}

export function parsePostsCsv(input: string): ImportParseResult {
  const parsedRows = parseCsvRows(input.trim());
  const rows = parsedRows.rows.filter((row) => row.some((cell) => cell.trim().length > 0));
  const errors = parsedRows.success ? [] : parsedRows.errors;

  if (rows.length === 0) {
    return {
      errors: [...errors, { code: "validation_error", message: "CSV import requires a header row." }],
      posts: [],
    };
  }

  const headers = rows[0]?.map((header) => header.trim()) ?? [];
  const records = rows.slice(1).map((row) => rowRecord(headers, row));
  const result = collectUniquePosts(records, { defaultSource: "import", startRow: 1, untrusted: true });

  return {
    errors: [...result.errors, ...errors],
    posts: result.posts,
  };
}

export function parsePostsJson(input: string): ImportParseResult {
  let payload: unknown;

  try {
    payload = JSON.parse(input);
  } catch {
    return {
      errors: [{ code: "invalid_json", message: "Import payload must be valid JSON." }],
      posts: [],
    };
  }

  return collectUniquePosts(jsonRecords(payload), { defaultSource: "import", startRow: 1, untrusted: true });
}
