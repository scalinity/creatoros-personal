import { randomUUID } from "node:crypto";

import { NextResponse, type NextRequest } from "next/server";

import { requireAdminForRoute } from "@/lib/auth/admin";
import { exportBlog } from "@/lib/blogs";
import { blogExportSchema } from "@/lib/blogs/validation";
import { createFixedWindowRateLimiter, rateLimitHeaders } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const blogExportLimiter = createFixedWindowRateLimiter({
  limit: 30,
  windowMs: 60 * 60 * 1_000,
});

function errorResponse(code: string, message: string, status: number, headers?: Record<string, string>) {
  return NextResponse.json(
    {
      data: null,
      error: { code, message },
      ok: false,
      request_id: randomUUID(),
    },
    { headers, status },
  );
}

async function readPayload(request: NextRequest) {
  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    try {
      return await request.json();
    } catch {
      return null;
    }
  }

  try {
    return Object.fromEntries((await request.formData()).entries());
  } catch {
    return Object.fromEntries(request.nextUrl.searchParams);
  }
}

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const guard = await requireAdminForRoute(request);

  if (!guard.ok) {
    return guard.response;
  }

  const decision = await blogExportLimiter.check({ id: `${guard.admin.userId}:blogs-export` });
  const headers = rateLimitHeaders(decision);

  if (!decision.allowed) {
    return errorResponse("rate_limited", "Too many blog export requests.", 429, headers);
  }

  const { id } = await context.params;
  const parsed = blogExportSchema.safeParse(await readPayload(request));

  if (!parsed.success) {
    return errorResponse("validation_error", "Blog export payload failed validation.", 400, headers);
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
    return errorResponse(notFound ? "not_found" : "internal_error", "Blog could not be exported.", notFound ? 404 : 500, headers);
  }
}
