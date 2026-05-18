import "server-only";

import type { Json } from "@/types/database";

export {
  APPEND_ONLY_CORE_TABLES,
  CORE_SCHEMA_TABLES,
  FULL_PROJECT_SCHEMA_TABLES,
  PHASE_06_SCHEMA_TABLES,
  SENSITIVE_CORE_TABLES,
  USER_OWNED_CORE_TABLES,
  USER_OWNED_PHASE_06_TABLES,
} from "./schema";
export type {
  AppendOnlyCoreTable,
  CoreSchemaTable,
  FullProjectSchemaTable,
  Phase06SchemaTable,
  SensitiveCoreTable,
  UserOwnedCoreTable,
  UserOwnedPhase06Table,
} from "./schema";
export type { Database, Json } from "@/types/database";

// L-22: shared helper to coerce a typed value into the generated Supabase
// `Json` type. Replaces the ~20 `as unknown as Json` double-casts scattered
// across lib/* — this version round-trips through JSON.stringify so the
// resulting value is structurally a Json (no Date instances, no functions),
// not just a TS-level cast.
export function toJson(value: unknown): Json {
  return JSON.parse(JSON.stringify(value ?? null)) as Json;
}
