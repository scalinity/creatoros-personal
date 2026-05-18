import "server-only";

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

// SCA-487 (W-8): JSON-shape coercion helpers consolidated in lib/db/json.ts.
// Each service module now imports from here / @/lib/db/json instead of
// keeping module-local copies that silently drifted in semantics.
export {
  asRecord,
  asStringArray,
  metadataWithPhase,
  nowIso,
  safeObject,
  safeStringArray,
  stripMarkdown,
  toJson,
} from "./json";
