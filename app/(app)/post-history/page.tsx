import { PostHistoryView, type PostHistoryFilters, type PostHistorySort } from "@/components/posts";
import { requireAdmin } from "@/lib/auth/admin";
import { loadPostHistory } from "@/lib/posts";

import { createManualPostAction, importPostsAction, updatePostMetricsAction } from "./actions";

export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;

type PostHistoryPageProps = {
  searchParams?: Promise<SearchParams>;
};

const validSorts = new Set<PostHistorySort>(["engagement", "heuristic", "impressions", "likes", "newest", "oldest", "virality"]);

function firstValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function filtersFromSearchParams(searchParams: SearchParams): PostHistoryFilters & { notice?: string; selected?: string } {
  const sort = firstValue(searchParams.sort);

  return {
    format: firstValue(searchParams.format) ?? "",
    from: firstValue(searchParams.from) ?? "",
    hook_type: firstValue(searchParams.hook_type) ?? "",
    link: firstValue(searchParams.link) ?? "",
    media: firstValue(searchParams.media) ?? "",
    notice: firstValue(searchParams.notice),
    owner: firstValue(searchParams.owner) ?? "",
    performance: firstValue(searchParams.performance) as PostHistoryFilters["performance"],
    q: firstValue(searchParams.q) ?? "",
    selected: firstValue(searchParams.selected),
    sort: sort && validSorts.has(sort as PostHistorySort) ? (sort as PostHistorySort) : "newest",
    source: firstValue(searchParams.source) ?? "",
    to: firstValue(searchParams.to) ?? "",
    tone: firstValue(searchParams.tone) ?? "",
    topic: firstValue(searchParams.topic) ?? "",
  };
}

export default async function PostHistoryPage({ searchParams }: PostHistoryPageProps) {
  const admin = await requireAdmin();
  const params = filtersFromSearchParams((await searchParams) ?? {});
  const { aggregates, posts, selectedPost } = await loadPostHistory(admin, params);

  return (
    <PostHistoryView
      aggregates={aggregates}
      createAction={createManualPostAction}
      filters={params}
      importAction={importPostsAction}
      notice={params.notice}
      posts={posts}
      selectedPost={selectedPost}
      updateAction={updatePostMetricsAction}
    />
  );
}
