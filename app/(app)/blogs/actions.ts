"use server";

import { redirect } from "next/navigation";

import { requireAdmin } from "@/lib/auth/admin";
import { rethrowIfRedirect } from "@/lib/server-only/action-redirect";
import { createBlog, generateBlogDraft, generateBlogOutline, generateBlogSeo, repurposeBlogToX, suggestBlogEdits, updateBlog } from "@/lib/blogs";
import { blogAiActionSchema, blogCreateSchema, blogUpdateSchema, formDataToBlogRecord } from "@/lib/blogs/validation";
import { createFixedWindowRateLimiter, MemoryRateLimitStore } from "@/lib/rate-limit";

const blogMutationLimiter = createFixedWindowRateLimiter({
  limit: 80,
  store: new MemoryRateLimitStore(),
  windowMs: 60 * 60 * 1_000,
});

const blogAiLimiter = createFixedWindowRateLimiter({
  limit: 20,
  store: new MemoryRateLimitStore(),
  windowMs: 60 * 60 * 1_000,
});

function redirectToBlogs(params: Record<string, string>): never {
  redirect(`/blogs?${new URLSearchParams(params).toString()}`);
}

function redirectToBlog(blogId: string, params: Record<string, string>): never {
  redirect(`/blogs/${blogId}?${new URLSearchParams(params).toString()}`);
}

async function assertAllowed(userId: string, key: "ai" | "mutation", blogId?: string) {
  const limiter = key === "ai" ? blogAiLimiter : blogMutationLimiter;
  const decision = await limiter.check({ id: `${userId}:blogs:${key}${blogId ? `:${blogId}` : ""}` });

  if (!decision.allowed) {
    if (blogId) redirectToBlog(blogId, { notice: "rate_limited" });
    redirectToBlogs({ notice: "rate_limited" });
  }
}

export async function createBlogAction(formData: FormData) {
  const admin = await requireAdmin();
  await assertAllowed(admin.userId, "mutation");
  const parsed = blogCreateSchema.safeParse(formDataToBlogRecord(formData));

  if (!parsed.success) {
    redirectToBlogs({ notice: "blog_create_failed" });
  }

  // L-9: initialize so the variable is never read in a definitely-assigned-by-flow
  // dependent on `redirectToBlogs(): never` — keeps the read at line below safe
  // even if the redirect helper's never-typing is weakened by future TS changes.
  let blogId = "";

  try {
    const blog = await createBlog(admin, parsed.data);
    blogId = blog.id;
  } catch (error) {
    rethrowIfRedirect(error);
    console.error("Failed to create blog", {
      reason: error instanceof Error ? error.message : "unknown",
    });
    redirectToBlogs({ notice: "blog_create_failed" });
  }

  redirectToBlog(blogId, { notice: "blog_created" });
}

export async function updateBlogAction(formData: FormData) {
  const admin = await requireAdmin();
  const parsed = blogUpdateSchema.safeParse(formDataToBlogRecord(formData));

  if (!parsed.success) {
    redirectToBlogs({ notice: "blog_update_failed" });
  }

  await assertAllowed(admin.userId, "mutation", parsed.data.id);

  try {
    const blog = await updateBlog(admin, parsed.data);
    redirectToBlog(blog.id, { notice: "blog_updated" });
  } catch (error) {
    rethrowIfRedirect(error);
    console.error("Failed to update blog", {
      blogId: parsed.data.id,
      reason: error instanceof Error ? error.message : "unknown",
    });
    redirectToBlog(parsed.data.id, { notice: "blog_update_failed" });
  }
}

async function runBlogAiAction(formData: FormData, expectedMode: "blog_to_x" | "draft" | "editor" | "outline" | "seo", notice: string) {
  const admin = await requireAdmin();
  const parsed = blogAiActionSchema.safeParse(formDataToBlogRecord(formData));

  if (!parsed.success || parsed.data.mode !== expectedMode) {
    redirectToBlogs({ notice: "blog_ai_validation_failed" });
  }

  await assertAllowed(admin.userId, "ai", parsed.data.blogId);

  try {
    if (expectedMode === "outline") await generateBlogOutline(admin, parsed.data);
    if (expectedMode === "draft") await generateBlogDraft(admin, parsed.data);
    if (expectedMode === "editor") await suggestBlogEdits(admin, parsed.data);
    if (expectedMode === "seo") await generateBlogSeo(admin, parsed.data);
    if (expectedMode === "blog_to_x") await repurposeBlogToX(admin, parsed.data);
  } catch (error) {
    rethrowIfRedirect(error);
    console.error("Blog AI workflow failed", {
      blogId: parsed.data.blogId,
      mode: expectedMode,
      reason: error instanceof Error ? error.message : "unknown",
    });
    redirectToBlog(parsed.data.blogId, { notice: `${expectedMode}_failed` });
  }

  redirectToBlog(parsed.data.blogId, { notice });
}

export async function generateBlogOutlineAction(formData: FormData) {
  await runBlogAiAction(formData, "outline", "outline_generated");
}

export async function generateBlogDraftAction(formData: FormData) {
  await runBlogAiAction(formData, "draft", "draft_generated");
}

export async function applyBlogEditorAction(formData: FormData) {
  await runBlogAiAction(formData, "editor", "editor_applied");
}

export async function generateBlogSeoAction(formData: FormData) {
  await runBlogAiAction(formData, "seo", "seo_generated");
}

export async function repurposeBlogToXAction(formData: FormData) {
  await runBlogAiAction(formData, "blog_to_x", "repurposed_to_x");
}
