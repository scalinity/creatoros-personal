import { notFound } from "next/navigation";

import { BlogDetailView } from "@/components/blogs";
import { requireAdmin } from "@/lib/auth/admin";
import { loadBlogDetail } from "@/lib/blogs";

import { applyBlogEditorAction, generateBlogDraftAction, generateBlogOutlineAction, generateBlogSeoAction, repurposeBlogToXAction, updateBlogAction } from "../actions";

export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;

type BlogDetailPageProps = {
  params: Promise<{ id: string }>;
  searchParams?: Promise<SearchParams>;
};

function firstValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function BlogDetailPage({ params, searchParams }: BlogDetailPageProps) {
  const admin = await requireAdmin();
  const { id } = await params;
  const query = (await searchParams) ?? {};
  let detail;

  try {
    detail = await loadBlogDetail(admin, id);
  } catch (error) {
    console.error("Failed to load blog detail", {
      blogId: id,
      reason: error instanceof Error ? error.message : "unknown",
    });
    notFound();
  }

  return (
    <BlogDetailView
      aiEditorAction={applyBlogEditorAction}
      detail={detail}
      exportActionBase={`/api/blogs/${id}/export`}
      generateDraftAction={generateBlogDraftAction}
      generateOutlineAction={generateBlogOutlineAction}
      generateSeoAction={generateBlogSeoAction}
      notice={firstValue(query.notice)}
      repurposeAction={repurposeBlogToXAction}
      updateAction={updateBlogAction}
    />
  );
}
