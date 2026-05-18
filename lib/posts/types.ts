// Shared post-history view models. These types are pure data and intentionally
// have no React/server-only imports so both `lib/posts` (server) and
// `components/posts` (presentation) can depend on them without inverting the
// architectural dependency direction (presentation → service, never the other
// way around).

import type { AggregateGroup, PerformanceBucket } from "@/lib/scoring";

export type PostHistorySort = "engagement" | "heuristic" | "impressions" | "likes" | "newest" | "oldest" | "virality";

export type PostHistoryFilters = {
  format?: string;
  from?: string;
  hook_type?: string;
  link?: string;
  media?: string;
  owner?: string;
  performance?: PerformanceBucket | "";
  q?: string;
  sort?: PostHistorySort;
  source?: string;
  to?: string;
  tone?: string;
  topic?: string;
};

export type PostHistoryPost = {
  authorDisplayName?: null | string;
  authorUsername?: null | string;
  bookmarkCount: number;
  contentPillar?: null | string;
  createdAt: string;
  createdAtPlatform?: null | string;
  engagementScore?: null | number;
  format?: null | string;
  hasLink: boolean;
  hasMedia: boolean;
  heuristicScore?: null | number;
  hookType?: null | string;
  id: string;
  impressionCount: number;
  isOwnerPost: boolean;
  lengthBucket?: null | string;
  likeCount: number;
  performanceBucket?: null | PerformanceBucket;
  platform?: string;
  platformPostId?: null | string;
  quoteCount: number;
  replyCount: number;
  repostCount: number;
  source: string;
  text: string;
  tone?: null | string;
  topic?: null | string;
  url?: null | string;
  viralityScore?: null | number;
};

export type PostHistoryAggregates = {
  dayOfWeek: AggregateGroup[];
  format: AggregateGroup[];
  hour: AggregateGroup[];
  topic: AggregateGroup[];
};
