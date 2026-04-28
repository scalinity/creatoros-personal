import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { getSupabaseServiceRoleConfig } from "@/lib/auth/config";
import type { Database } from "@/types/database";

let serviceRoleClient: null | SupabaseClient<Database> = null;

export function createSupabaseServiceRoleClient() {
  if (serviceRoleClient) {
    return serviceRoleClient;
  }

  const { serviceRoleKey, url } = getSupabaseServiceRoleConfig();

  serviceRoleClient = createClient<Database>(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  });

  return serviceRoleClient;
}
