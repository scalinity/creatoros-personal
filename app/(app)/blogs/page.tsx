import { BlogWorkspaceView } from "@/components/blogs";
import { requireAdmin } from "@/lib/auth/admin";
import { loadBlogsWorkspace } from "@/lib/blogs";

export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;

type BlogsPageProps = {
  searchParams?: Promise<SearchParams>;
};

function firstValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function BlogsPage({ searchParams }: BlogsPageProps) {
  const admin = await requireAdmin();
  const params = (await searchParams) ?? {};
  const filters = {
    notice: firstValue(params.notice),
    q: firstValue(params.q),
    selected: firstValue(params.selected),
    status: firstValue(params.status),
    tag: firstValue(params.tag),
  };
  const workspace = await loadBlogsWorkspace(admin, filters);

  return <BlogWorkspaceView {...workspace} filters={filters} />;
}
