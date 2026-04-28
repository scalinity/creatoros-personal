"use server";

import { redirect } from "next/navigation";

import { requireAdmin } from "@/lib/auth/admin";
import { parseManualPostInput, parsePostsCsv, parsePostsJson } from "@/lib/imports";
import { createManualPost, persistImportedPosts, updatePostMetrics } from "@/lib/posts";
import { formDataToRecord, postMetricUpdateFormSchema, postsImportFormSchema } from "@/lib/posts/validation";

function redirectWithNotice(params: Record<string, string>): never {
  redirect(`/post-history?${new URLSearchParams(params).toString()}`);
}

export async function createManualPostAction(formData: FormData) {
  const admin = await requireAdmin();
  const parsed = parseManualPostInput(formDataToRecord(formData));

  if (!parsed.success) {
    redirectWithNotice({ notice: "manual_validation_failed" });
  }

  const post = await createManualPost(admin, parsed.post);
  redirectWithNotice({ notice: "post_created", selected: post.id });
}

export async function importPostsAction(formData: FormData) {
  const admin = await requireAdmin();
  const form = postsImportFormSchema.safeParse(formDataToRecord(formData));

  if (!form.success) {
    redirectWithNotice({ notice: "import_failed" });
  }

  const parsed = form.data.mode === "csv" ? parsePostsCsv(form.data.payload) : parsePostsJson(form.data.payload);

  if (parsed.posts.length === 0) {
    redirectWithNotice({ notice: "import_failed" });
  }

  const result = await persistImportedPosts(admin, parsed.posts, { parseErrorCount: parsed.errors.length });
  redirectWithNotice({
    notice: `imported_${result.created}_created_${result.updated}_updated_${result.failed}_failed`,
  });
}

export async function updatePostMetricsAction(formData: FormData) {
  const admin = await requireAdmin();
  const parsed = postMetricUpdateFormSchema.safeParse(formDataToRecord(formData));

  if (!parsed.success) {
    redirectWithNotice({ notice: "metric_validation_failed" });
  }

  const post = await updatePostMetrics(admin, parsed.data);
  redirectWithNotice({ notice: "metrics_updated", selected: post.id });
}
