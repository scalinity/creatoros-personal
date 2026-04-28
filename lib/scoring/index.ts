export type PostMetricInput = {
  bookmarkCount?: null | number;
  impressionCount?: null | number;
  likeCount?: null | number;
  mediaViewCount?: null | number;
  profileClickCount?: null | number;
  quoteCount?: null | number;
  replyCount?: null | number;
  repostCount?: null | number;
  urlLinkClickCount?: null | number;
  videoViewCount?: null | number;
};

export type PostScoreInput = PostMetricInput & {
  createdAt?: null | string;
  engagementScore?: null | number;
  format?: null | string;
  heuristicScore?: null | number;
  id?: string;
  topic?: null | string;
  viralityScore?: null | number;
};

export type RecencyAdjustedScoreInput = {
  halfLifeDays?: number;
  now?: Date;
  score: null | number;
  timestamp?: null | string;
};

export type MetricVelocitySnapshot = PostMetricInput & {
  snapshotAt: string;
};

export type MetricVelocityInput = {
  current: MetricVelocitySnapshot;
  previous: MetricVelocitySnapshot;
};

export type MetricVelocity = {
  bookmarkVelocityPerHour: number;
  engagementVelocityPerHour: number;
  hoursElapsed: number;
  impressionVelocityPerHour: number;
  likeVelocityPerHour: number;
  quoteVelocityPerHour: number;
  replyVelocityPerHour: number;
  repostVelocityPerHour: number;
};

export type PostLengthBucket = "essay" | "long" | "micro" | "short" | "standard";
export type PerformanceBucket = "breakout" | "low" | "steady" | "strong" | "unknown";

export type AggregateGroup = {
  averageEngagementScore: number;
  averageHeuristicScore: number;
  averageViralityScore: number;
  count: number;
  key: string;
  label: string;
  topPostId: null | string;
  totalEngagements: number;
  totalImpressions: number;
};

function metric(value: null | number | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return 0;
  }

  return value;
}

function round(value: number, digits = 2) {
  const multiplier = 10 ** digits;
  return Math.round((value + Number.EPSILON) * multiplier) / multiplier;
}

function clamp(value: number, min = 0, max = 100) {
  return Math.max(min, Math.min(max, value));
}

function rawEngagement(metrics: PostMetricInput) {
  return (
    metric(metrics.likeCount) +
    metric(metrics.replyCount) +
    metric(metrics.repostCount) +
    metric(metrics.quoteCount) +
    metric(metrics.bookmarkCount) +
    metric(metrics.profileClickCount) +
    metric(metrics.urlLinkClickCount)
  );
}

function weightedEngagement(metrics: PostMetricInput) {
  return (
    metric(metrics.likeCount) +
    metric(metrics.replyCount) * 2 +
    metric(metrics.repostCount) * 2 +
    metric(metrics.quoteCount) * 2 +
    metric(metrics.bookmarkCount) +
    metric(metrics.profileClickCount) +
    metric(metrics.urlLinkClickCount) * 2 +
    metric(metrics.mediaViewCount) * 0.05 +
    metric(metrics.videoViewCount) * 0.05
  );
}

function weightedVirality(metrics: PostMetricInput) {
  return metric(metrics.repostCount) * 4 + metric(metrics.quoteCount) * 4 + metric(metrics.replyCount) * 1.5;
}

export function calculateEngagementScore(metrics: PostMetricInput) {
  const impressions = metric(metrics.impressionCount);
  const weighted = weightedEngagement(metrics);

  if (weighted === 0) {
    return 0;
  }

  if (impressions > 0) {
    return round(clamp((weighted / impressions) * 100));
  }

  return round(clamp(Math.log10(weighted + 1) * 10));
}

export function calculateViralityScore(metrics: PostMetricInput) {
  const impressions = metric(metrics.impressionCount);
  const weighted = weightedVirality(metrics);

  if (weighted === 0) {
    return 0;
  }

  if (impressions > 0) {
    return round(clamp((weighted / impressions) * 100));
  }

  return round(clamp(Math.log10(weighted + 1) * 6));
}

export function calculateRecencyAdjustedScore(input: RecencyAdjustedScoreInput) {
  if (typeof input.score !== "number" || !Number.isFinite(input.score)) {
    return null;
  }

  if (!input.timestamp) {
    return round(clamp(input.score));
  }

  const timestamp = new Date(input.timestamp).getTime();

  if (!Number.isFinite(timestamp)) {
    return round(clamp(input.score));
  }

  const now = input.now?.getTime() ?? Date.now();
  const ageMs = Math.max(0, now - timestamp);
  const halfLifeDays = input.halfLifeDays ?? 45;
  const halfLifeMs = Math.max(1, halfLifeDays) * 24 * 60 * 60 * 1_000;
  const decay = 0.5 ** (ageMs / halfLifeMs);

  return round(clamp(input.score * decay));
}

export function calculateMetricVelocity(input: MetricVelocityInput): MetricVelocity {
  const currentAt = new Date(input.current.snapshotAt).getTime();
  const previousAt = new Date(input.previous.snapshotAt).getTime();
  const hoursElapsed = Math.max(0, (currentAt - previousAt) / (60 * 60 * 1_000));

  if (hoursElapsed <= 0 || !Number.isFinite(hoursElapsed)) {
    return {
      bookmarkVelocityPerHour: 0,
      engagementVelocityPerHour: 0,
      hoursElapsed: 0,
      impressionVelocityPerHour: 0,
      likeVelocityPerHour: 0,
      quoteVelocityPerHour: 0,
      replyVelocityPerHour: 0,
      repostVelocityPerHour: 0,
    };
  }

  const perHour = (current: null | number | undefined, previous: null | number | undefined) =>
    round(Math.max(0, metric(current) - metric(previous)) / hoursElapsed);

  return {
    bookmarkVelocityPerHour: perHour(input.current.bookmarkCount, input.previous.bookmarkCount),
    engagementVelocityPerHour: round(
      Math.max(0, rawEngagement(input.current) - rawEngagement(input.previous)) / hoursElapsed,
    ),
    hoursElapsed: round(hoursElapsed),
    impressionVelocityPerHour: perHour(input.current.impressionCount, input.previous.impressionCount),
    likeVelocityPerHour: perHour(input.current.likeCount, input.previous.likeCount),
    quoteVelocityPerHour: perHour(input.current.quoteCount, input.previous.quoteCount),
    replyVelocityPerHour: perHour(input.current.replyCount, input.previous.replyCount),
    repostVelocityPerHour: perHour(input.current.repostCount, input.previous.repostCount),
  };
}

export function classifyPostLengthBucket(text: string): PostLengthBucket {
  const length = text.trim().length;

  if (length <= 80) return "micro";
  if (length <= 180) return "short";
  if (length <= 280) return "standard";
  if (length <= 1000) return "long";
  return "essay";
}

export function classifyPerformanceBucket(score: null | number | undefined): PerformanceBucket {
  if (typeof score !== "number" || !Number.isFinite(score)) return "unknown";
  if (score < 25) return "low";
  if (score < 50) return "steady";
  if (score < 75) return "strong";
  return "breakout";
}

function aggregateBy(posts: PostScoreInput[], keyForPost: (post: PostScoreInput) => string): AggregateGroup[] {
  const groups = new Map<string, AggregateGroup & { totalEngagementScore: number; totalHeuristicScore: number; totalViralityScore: number }>();

  for (const post of posts) {
    const key = keyForPost(post);
    const current = groups.get(key) ?? {
      averageEngagementScore: 0,
      averageHeuristicScore: 0,
      averageViralityScore: 0,
      count: 0,
      key,
      label: key,
      topPostId: null,
      totalEngagementScore: 0,
      totalEngagements: 0,
      totalHeuristicScore: 0,
      totalImpressions: 0,
      totalViralityScore: 0,
    };
    const engagementScore = post.engagementScore ?? calculateEngagementScore(post);
    const viralityScore = post.viralityScore ?? calculateViralityScore(post);
    const heuristicScore = post.heuristicScore ?? round((engagementScore + viralityScore) / 2);

    current.count += 1;
    current.totalEngagementScore += engagementScore;
    current.totalViralityScore += viralityScore;
    current.totalHeuristicScore += heuristicScore;
    current.totalImpressions += metric(post.impressionCount);
    current.totalEngagements += rawEngagement(post);

    if (post.id && (!current.topPostId || heuristicScore >= current.averageHeuristicScore)) {
      current.topPostId = post.id;
    }

    current.averageEngagementScore = round(current.totalEngagementScore / current.count);
    current.averageViralityScore = round(current.totalViralityScore / current.count);
    current.averageHeuristicScore = round(current.totalHeuristicScore / current.count);

    groups.set(key, current);
  }

  return [...groups.values()]
    .sort((left, right) => right.count - left.count)
    .map((group) => ({
      averageEngagementScore: group.averageEngagementScore,
      averageHeuristicScore: group.averageHeuristicScore,
      averageViralityScore: group.averageViralityScore,
      count: group.count,
      key: group.key,
      label: group.label,
      topPostId: group.topPostId,
      totalEngagements: group.totalEngagements,
      totalImpressions: group.totalImpressions,
    }));
}

function normalizedGroup(value: null | string | undefined) {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : "Uncategorized";
}

export function aggregateByTopic(posts: PostScoreInput[]) {
  return aggregateBy(posts, (post) => normalizedGroup(post.topic));
}

export function aggregateByFormat(posts: PostScoreInput[]) {
  return aggregateBy(posts, (post) => normalizedGroup(post.format));
}

export function aggregateByDayOfWeek(posts: PostScoreInput[]) {
  const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

  return aggregateBy(posts, (post) => {
    const date = new Date(post.createdAt ?? "");
    return Number.isFinite(date.getTime()) ? dayNames[date.getUTCDay()] ?? "Unknown" : "Unknown";
  });
}

export function aggregateByHour(posts: PostScoreInput[]) {
  return aggregateBy(posts, (post) => {
    const date = new Date(post.createdAt ?? "");
    return Number.isFinite(date.getTime()) ? String(date.getUTCHours()).padStart(2, "0") : "Unknown";
  });
}

export function detectPossibleHookType(text: string) {
  const normalized = text.trim().toLowerCase();

  if (!normalized) return "unknown";
  if (normalized.endsWith("?") || normalized.startsWith("what if") || normalized.startsWith("why ")) return "question";
  if (/\b(everyone says|unpopular opinion|but|wrong|myth)\b/.test(normalized)) return "contrarian";
  if (/^\d+[.)]\s/.test(normalized) || /\b\d+\s+(ways|lessons|rules|reasons)\b/.test(normalized)) return "list";
  if (/\b(i learned|story|when i|last year|years ago)\b/.test(normalized)) return "story";
  return "unknown";
}

export function detectPossibleFormat(text: string) {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const numberedLines = lines.filter((line) => /^\d+[.)]\s+/.test(line)).length;

  if (numberedLines >= 2) return "thread";
  if (lines.length >= 4) return "thread";
  if (/^\d+[.)]\s/.test(text.trim())) return "list";
  return "single";
}
