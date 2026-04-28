import "server-only";

import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

import type { Database } from "@/types/database";

import { getSupabaseAuthConfig } from "./config";

export async function createSupabaseServerClient(): Promise<SupabaseClient<Database>> {
  const { anonKey, url } = getSupabaseAuthConfig();
  const cookieStore = await cookies();

  return createServerClient<Database>(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, options, value } of cookiesToSet) {
          try {
            cookieStore.set(name, value, options);
          } catch {
            // Server Components cannot set cookies; Proxy and Server Actions handle refresh writes.
          }
        }
      },
    },
  });
}

