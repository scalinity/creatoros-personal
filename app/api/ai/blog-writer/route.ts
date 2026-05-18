import { type NextRequest } from "next/server";

import { requireAdminForRoute } from "@/lib/auth/admin";
import { generateBlogDraft, generateBlogOutline, generateBlogSeo, repurposeBlogToX, suggestBlogEdits } from "@/lib/blogs";
import { blogAiActionSchema } from "@/lib/blogs/validation";
import { AiStructuredOutputError } from "@/lib/ai";
import { AiProviderTimeoutError } from "@/lib/ai/retry";
import { envelope, errorResponse, getRequestId, readJsonBody } from "@/lib/http/envelope";
import { createFixedWindowRateLimiter, rateLimitHeaders } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const blogAiLimiter = createFixedWindowRateLimiter({
  limit: 20,
  windowMs: 60 * 60 * 1_000,
});

type BlogAiApiError = {
  code: string;
  message: string;
  status: number;
};

function blogAiApiError(error: unknown): BlogAiApiError {
  const message = error instanceof Error ? error.message : "";

  if (error instanceof AiStructuredOutputError || message.startsWith("ai_invalid_output")) {
    return { code: "ai_invalid_output", message: "AI output failed schema validation.", status: 502 };
  }

  if (error instanceof AiProviderTimeoutError || message.includes("timed out")) {
    return { code: "ai_provider_timeout", message: "AI provider request timed out.", status: 504 };
  }

  if (message.includes("API_KEY is not configured") || message.includes("provider selected with incompatible AI_MODEL")) {
    return { code: "ai_provider_unconfigured", message: "AI provider is not configured for this workflow.", status: 503 };
  }

  if (message.includes("provider unavailable")) {
    return { code: "ai_provider_unavailable", message: "AI provider is currently unavailable.", status: 502 };
  }

  if (message.startsWith("Blog post not found")) {
    return { code: "not_found", message: "Blog post was not found.", status: 404 };
  }

  return { code: "internal_error", message: "Blog AI workflow could not be completed.", status: 500 };
}

export async function POST(request: NextRequest) {
  const requestId = getRequestId(request);
  const guard = await requireAdminForRoute(request);

  if (!guard.ok) {
    return guard.response;
  }

  const decision = await blogAiLimiter.check({ id: `${guard.admin.userId}:blog-writer` });
  const headers = rateLimitHeaders(decision);

  if (!decision.allowed) {
    return errorResponse(requestId, "rate_limited", "Too many blog AI requests.", 429, headers);
  }

  const parsed = blogAiActionSchema.safeParse(await readJsonBody(request));

  if (!parsed.success) {
    return errorResponse(requestId, "validation_error", "Blog AI payload failed validation.", 400, headers);
  }

  try {
    if (parsed.data.mode === "outline") {
      const result = await generateBlogOutline(guard.admin, parsed.data);
      return envelope(requestId, { blog: result.blog, mode: parsed.data.mode, output: result.output }, headers);
    }

    if (parsed.data.mode === "draft") {
      const result = await generateBlogDraft(guard.admin, parsed.data);
      return envelope(requestId, { blog: result.blog, mode: parsed.data.mode, output: result.output }, headers);
    }

    if (parsed.data.mode === "editor") {
      const result = await suggestBlogEdits(guard.admin, parsed.data);
      return envelope(requestId, { blog: result.blog, mode: parsed.data.mode, output: result.output }, headers);
    }

    if (parsed.data.mode === "seo") {
      const result = await generateBlogSeo(guard.admin, parsed.data);
      return envelope(requestId, { blog: result.blog, mode: parsed.data.mode, output: result.output }, headers);
    }

    const result = await repurposeBlogToX(guard.admin, parsed.data);
    return envelope(
      requestId,
      {
        generated_output_ids: result.generatedOutputs.map((output) => output.id),
        job_id: result.jobId,
        mode: parsed.data.mode,
        output_count: result.generatedOutputs.length,
      },
      headers,
    );
  } catch (error) {
    const mappedError = blogAiApiError(error);
    console.error("Blog AI API workflow failed", {
      blogId: parsed.data.blogId,
      code: mappedError.code,
      mode: parsed.data.mode,
    });
    return errorResponse(requestId, mappedError.code, mappedError.message, mappedError.status, headers);
  }
}
