import { randomUUID } from "node:crypto";

import { NextResponse, type NextRequest } from "next/server";

import { requireAdminForRoute } from "@/lib/auth/admin";
import { updateBlog } from "@/lib/blogs";
import { blogUpdateSchema } from "@/lib/blogs/validation";
import { createFixedWindowRateLimiter, rateLimitHeaders } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const blogUpdateLimiter = createFixedWindowRateLimiter({
  limit: 60,
  windowMs: 60_000,
});

function envelope(data: unknown, headers?: Record<string, string>) {
  return NextResponse.json({ data, error: null, ok: true, request_id: randomUUID() }, { headers });
}

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

async function readJsonBody(request: NextRequest) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const guard = await requireAdminForRoute(request);

  if (!guard.ok) {
    return guard.response;
  }

  const decision = await blogUpdateLimiter.check({ id: `${guard.admin.userId}:blogs-update` });
  const headers = rateLimitHeaders(decision);

  if (!decision.allowed) {
    return errorResponse("rate_limited", "Too many blog update requests.", 429, headers);
  }

  const { id } = await context.params;
  const body = await readJsonBody(request);
  const parsed = blogUpdateSchema.safeParse({
    ...(body && typeof body === "object" && !Array.isArray(body) ? body : {}),
    id,
  });

  if (!parsed.success) {
    return errorResponse("validation_error", "Blog update payload failed validation.", 400, headers);
  }

  try {
    const blog = await updateBlog(guard.admin, parsed.data);
    return envelope({ blog }, headers);
  } catch (error) {
    const notFound = error instanceof Error && error.message.includes("not found");
    console.error("Failed to update blog through API", {
      id,
      reason: error instanceof Error ? error.message : "unknown",
    });
    return errorResponse(notFound ? "not_found" : "internal_error", "Blog could not be updated.", notFound ? 404 : 500, headers);
  }
}
