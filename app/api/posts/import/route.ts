import { randomUUID } from "node:crypto";

import { NextResponse, type NextRequest } from "next/server";

import { requireAdminForRoute } from "@/lib/auth/admin";
import { parseManualPostInput, parsePostsCsv, parsePostsJson } from "@/lib/imports";
import { createManualPost, persistImportedPosts } from "@/lib/posts";
import { postsImportRouteSchema } from "@/lib/posts/validation";
import { createFixedWindowRateLimiter, rateLimitHeaders } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const importLimiter = createFixedWindowRateLimiter({
  limit: 10,
  windowMs: 60 * 1_000,
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

function payloadAsString(payload: unknown) {
  return typeof payload === "string" ? payload : JSON.stringify(payload);
}

export async function POST(request: NextRequest) {
  const guard = await requireAdminForRoute(request);

  if (!guard.ok) {
    return guard.response;
  }

  const decision = await importLimiter.check({ id: `${guard.admin.userId}:posts-import` });
  const headers = rateLimitHeaders(decision);

  if (!decision.allowed) {
    return errorResponse("rate_limited", "Too many post import requests.", 429, headers);
  }

  const body = postsImportRouteSchema.safeParse(await readJsonBody(request));

  if (!body.success) {
    return errorResponse("validation_error", "Import payload must include mode and payload.", 400, headers);
  }

  if (body.data.mode === "single") {
    const payload = body.data.payload && typeof body.data.payload === "object" && !Array.isArray(body.data.payload) ? body.data.payload : {};
    const parsed = parseManualPostInput({
      ...(payload as Record<string, unknown>),
      ...(typeof body.data.is_owner_post === "boolean" ? { is_owner_post: body.data.is_owner_post } : {}),
    });

    if (!parsed.success) {
      return errorResponse("validation_error", "Manual post payload failed validation.", 400, headers);
    }

    const post = await createManualPost(guard.admin, parsed.post);
    return envelope({ post }, headers);
  }

  const parsed = body.data.mode === "csv" ? parsePostsCsv(payloadAsString(body.data.payload)) : parsePostsJson(payloadAsString(body.data.payload));

  if (parsed.posts.length === 0) {
    return errorResponse("validation_error", "No valid posts were found in the import payload.", 400, headers);
  }

  const result = await persistImportedPosts(guard.admin, parsed.posts, {
    parseErrorCount: parsed.errors.length,
    request,
  });

  return envelope(
    {
      errors: parsed.errors,
      import_job_id: result.importJobId,
      records_created: result.created,
      records_failed: result.failed,
      records_updated: result.updated,
    },
    headers,
  );
}
