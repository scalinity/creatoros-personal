import { randomUUID } from "node:crypto";

import { NextResponse, type NextRequest } from "next/server";

import { requireAdminForRoute } from "@/lib/auth/admin";
import { createBlog } from "@/lib/blogs";
import { blogCreateSchema } from "@/lib/blogs/validation";
import { createFixedWindowRateLimiter, rateLimitHeaders } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const blogCreateLimiter = createFixedWindowRateLimiter({
  limit: 30,
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

export async function POST(request: NextRequest) {
  const guard = await requireAdminForRoute(request);

  if (!guard.ok) {
    return guard.response;
  }

  const decision = await blogCreateLimiter.check({ id: `${guard.admin.userId}:blogs-create` });
  const headers = rateLimitHeaders(decision);

  if (!decision.allowed) {
    return errorResponse("rate_limited", "Too many blog create requests.", 429, headers);
  }

  const parsed = blogCreateSchema.safeParse(await readJsonBody(request));

  if (!parsed.success) {
    return errorResponse("validation_error", "Blog payload failed validation.", 400, headers);
  }

  try {
    const blog = await createBlog(guard.admin, parsed.data);
    return envelope({ blog }, headers);
  } catch (error) {
    console.error("Failed to create blog through API", {
      reason: error instanceof Error ? error.message : "unknown",
    });
    return errorResponse("internal_error", "Blog could not be created.", 500, headers);
  }
}
