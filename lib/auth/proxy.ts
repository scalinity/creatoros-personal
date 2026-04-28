import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import type { Database } from "@/types/database";

import { getOptionalSupabaseAuthConfig } from "./config";
import { isAdminEmail } from "./allowlist";
import { isPrivateAppPath } from "./routes";

function redirect(request: NextRequest, path: string) {
  return NextResponse.redirect(new URL(path, request.url));
}

export async function updateSupabaseSession(request: NextRequest) {
  const config = getOptionalSupabaseAuthConfig();

  if (!config) {
    if (isPrivateAppPath(request.nextUrl.pathname)) {
      return redirect(request, "/login?error=auth_unconfigured");
    }

    return NextResponse.next({ request });
  }

  let response = NextResponse.next({ request });
  const supabase = createServerClient<Database>(config.url, config.anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }

        response = NextResponse.next({ request });

        for (const { name, options, value } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const pathname = request.nextUrl.pathname;
  const isAdmin = isAdminEmail(user?.email, process.env.ADMIN_EMAILS);

  if (pathname === "/") {
    return redirect(request, isAdmin ? "/dashboard" : "/login");
  }

  if (pathname === "/login" && isAdmin) {
    return redirect(request, "/dashboard");
  }

  if (isPrivateAppPath(pathname) && !user) {
    const params = new URLSearchParams({
      error: "unauthenticated",
      next: `${pathname}${request.nextUrl.search}`,
    });

    return redirect(request, `/login?${params.toString()}`);
  }

  return response;
}

