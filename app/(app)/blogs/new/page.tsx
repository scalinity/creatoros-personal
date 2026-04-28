import { NewBlogView } from "@/components/blogs";
import { requireAdmin } from "@/lib/auth/admin";

import { createBlogAction } from "../actions";

export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;

type NewBlogPageProps = {
  searchParams?: Promise<SearchParams>;
};

function firstValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function NewBlogPage({ searchParams }: NewBlogPageProps) {
  await requireAdmin();
  const params = (await searchParams) ?? {};

  return <NewBlogView createAction={createBlogAction} notice={firstValue(params.notice)} />;
}
