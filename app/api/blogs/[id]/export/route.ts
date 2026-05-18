import { NextResponse, type NextRequest } from "next/server";

import { requireAdminForRoute } from "@/lib/auth/admin";
import { exportBlog } from "@/lib/blogs";
import { blogExportSchema } from "@/lib/blogs/validation";
import { errorResponse, getRequestId, readBoundedJsonBody } from "@/lib/http/envelope";
import { createFixedWindowRateLimiter, rateLimitHeaders } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const blogExportLimiter = createFixedWindowRateLimiter({
  limit: 30,
  windowMs: 60 * 60 * 1_000,
});

async function readPayload(
  request: NextRequest,
  requestId: string,
  headers: Record<string, string>,
): Promise<{ ok: true; value: unknown } | { ok: false; response: ReturnType<typeof errorResponse> }> {
  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    const bounded = await readBoundedJsonBody(request, requestId, { headers, limitBytes: 1_000_000 });
    if (!bounded.ok) return { ok: false, response: bounded.response };
    return { ok: true, value: bounded.value };
  }

  try {
    return { ok: true, value: Object.fromEntries((await request.formData()).entries()) };
  } catch {
    return { ok: true, value: Object.fromEntries(request.nextUrl.searchParams) };
  }
}

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const requestId = getRequestId(request);
  const guard = await requireAdminForRoute(request);

  if (!guard.ok) {
    return guard.response;
  }

  const decision = await blogExportLimiter.check({ id: `${guard.admin.userId}:blogs-export` });
  const headers = rateLimitHeaders(decision);

  if (!decision.allowed) {
    return errorResponse(requestId, "rate_limited", "Too many blog export requests.", 429, headers);
  }

  const { id } = await context.params;
  const payload = await readPayload(request, requestId, headers);
  if (!payload.ok) return payload.response;
  const parsed = blogExportSchema.safeParse(payload.value);

  if (!parsed.success) {
    return errorResponse(requestId, "validation_error", "Blog export payload failed validation.", 400, headers);
  }

  try {
    const artifact = await exportBlog(guard.admin, { blogId: id, format: parsed.data.format });
    return new NextResponse(artifact.payload, {
      headers: {
        ...headers,
        "Content-Disposition": artifact.contentDisposition,
        "Content-Type": artifact.contentType,
        "X-Content-Type-Options": "nosniff",
        "X-CreatorOS-Export-Id": artifact.id,
      },
    });
  } catch (error) {
    const notFound = error instanceof Error && error.message.includes("not found");
    console.error("Failed to export blog", {
      id,
      reason: error instanceof Error ? error.message : "unknown",
    });
    return errorResponse(requestId, notFound ? "not_found" : "internal_error", "Blog could not be exported.", notFound ? 404 : 500, headers);
  }
}
