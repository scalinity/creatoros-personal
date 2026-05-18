// SCA-539 (S-33): canonical createSupabaseMock + createAdminContext helpers
// extracted from ~10 inline copies that lived in tests/unit/{publishing, x,
// voice, blogs, coach, growth, inspiration, reply-guy, ai-workflows,
// ai}/...test.ts. The copies drifted slightly across phases (rpc support,
// upsert tracking, spy hooks) so each spec that opts in does so with a
// minimal extension — specs that need deeper customization keep their
// inline mocks and reference this file in a comment.
//
// Shape: createSupabaseMock(seedRows, options?) returns
//   { supabase, inserts, updates, upserts, rows, rpcCalls? }
//
// where the chainable `from(table).select().eq().is().single()/maybeSingle()/limit()`,
// `.update(payload).eq().select().single()`, `.insert(payload).select().single()`,
// and `.upsert(payload).select().single()` paths all resolve to the seeded
// in-memory rows. `then` is supported on the select and update chains so
// `await` without `single()` resolves to the filtered rows.
//
// The `now` constant in the consuming spec controls timestamp values; we
// take it as an option so the test fixture's `now` flows in.

import type { AdminContext } from "@/lib/auth/admin";

export type SupabaseMockRow = Record<string, unknown>;
type Filter = { key: string; op: "eq" | "is"; value: unknown };

export type SupabaseMockOptions = {
  // ISO timestamp injected into created_at / updated_at on rowFor.
  now?: string;
  // When set, rpc calls record into `rpcCalls` and the named handler synthesizes a return value.
  rpcHandlers?: Record<string, (params: unknown) => { data: unknown; error: null | { message: string } }>;
};

export type SupabaseMockResult = {
  inserts: Record<string, SupabaseMockRow[]>;
  rows: Record<string, SupabaseMockRow[]>;
  rpcCalls: Array<{ args: unknown; fn: string }>;
  supabase: unknown;
  updates: Record<string, Array<{ filters: Filter[]; payload: SupabaseMockRow }>>;
  upserts: Record<string, SupabaseMockRow[]>;
};

export function createSupabaseMock(
  seedRows: Record<string, SupabaseMockRow[]> = {},
  options: SupabaseMockOptions = {},
): SupabaseMockResult {
  const now = options.now ?? new Date().toISOString();
  const inserts: Record<string, SupabaseMockRow[]> = {};
  const rows: Record<string, SupabaseMockRow[]> = Object.fromEntries(
    Object.entries(seedRows).map(([table, seeded]) => [table, seeded.map((row) => ({ ...row }))]),
  );
  const updates: Record<string, Array<{ filters: Filter[]; payload: SupabaseMockRow }>> = {};
  const upserts: Record<string, SupabaseMockRow[]> = {};
  const rpcCalls: Array<{ args: unknown; fn: string }> = [];
  let idSequence = 0;

  function rowFor(table: string, payload: SupabaseMockRow): SupabaseMockRow {
    idSequence += 1;
    return {
      created_at: now,
      deleted_at: null,
      id: typeof payload.id === "string" ? payload.id : `${table}-${idSequence}`,
      metadata: {},
      updated_at: now,
      ...payload,
    };
  }

  function filteredRows(table: string, filters: Filter[]): SupabaseMockRow[] {
    return (rows[table] ?? []).filter((row) =>
      filters.every((filter) => row[filter.key] === filter.value),
    );
  }

  function selectChain(table: string) {
    const filters: Filter[] = [];
    const chain: Record<string, unknown> = {
      eq(key: string, value: unknown) {
        filters.push({ key, op: "eq", value });
        return chain;
      },
      in(key: string, values: unknown[]) {
        // Coerce `in (...)` to: row[key] is contained in `values`.
        const original = filters.length;
        chain.then = (<TResult1, TResult2>(
          onfulfilled?: ((value: { data: SupabaseMockRow[]; error: null }) => PromiseLike<TResult1> | TResult1) | null,
          onrejected?: ((reason: unknown) => PromiseLike<TResult2> | TResult2) | null,
        ) =>
          Promise.resolve({
            data: (rows[table] ?? []).filter(
              (row) =>
                filters.slice(0, original).every((filter) => row[filter.key] === filter.value) &&
                values.includes(row[key]),
            ),
            error: null as null,
          }).then(onfulfilled, onrejected)) as never;
        return chain;
      },
      is(key: string, value: unknown) {
        filters.push({ key, op: "is", value });
        return chain;
      },
      limit(count: number) {
        return Promise.resolve({ data: filteredRows(table, filters).slice(0, count), error: null });
      },
      maybeSingle() {
        return Promise.resolve({ data: filteredRows(table, filters)[0] ?? null, error: null });
      },
      order() {
        return chain;
      },
      single() {
        const data = filteredRows(table, filters)[0] ?? null;
        return Promise.resolve({ data, error: data ? null : { message: "not found" } });
      },
      then<TResult1 = { data: SupabaseMockRow[]; error: null }, TResult2 = never>(
        onfulfilled?: ((value: { data: SupabaseMockRow[]; error: null }) => TResult1 | PromiseLike<TResult1>) | null,
        onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
      ) {
        return Promise.resolve({ data: filteredRows(table, filters), error: null }).then(onfulfilled, onrejected);
      },
    };
    return chain;
  }

  function updateChain(table: string, payload: SupabaseMockRow) {
    const filters: Filter[] = [];
    const chain: Record<string, unknown> = {
      eq(key: string, value: unknown) {
        filters.push({ key, op: "eq", value });
        return chain;
      },
      is(key: string, value: unknown) {
        filters.push({ key, op: "is", value });
        return chain;
      },
      select() {
        return {
          async single() {
            const existing = filteredRows(table, filters)[0] ?? null;
            if (!existing) return { data: null, error: { message: "not found" } };
            const updated = { ...existing, ...payload, updated_at: now };
            rows[table] = (rows[table] ?? []).map((row) => (row === existing ? updated : row));
            updates[table] = [...(updates[table] ?? []), { filters, payload }];
            return { data: updated, error: null };
          },
        };
      },
      then<TResult1 = { error: null }, TResult2 = never>(
        onfulfilled?: ((value: { error: null }) => TResult1 | PromiseLike<TResult1>) | null,
        onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
      ) {
        rows[table] = (rows[table] ?? []).map((row) =>
          filteredRows(table, filters).includes(row) ? { ...row, ...payload, updated_at: now } : row,
        );
        updates[table] = [...(updates[table] ?? []), { filters, payload }];
        return Promise.resolve({ error: null }).then(onfulfilled, onrejected);
      },
    };
    return chain;
  }

  function mutationResult(table: string, payload: SupabaseMockRow) {
    const row = rowFor(table, payload);
    rows[table] = [...(rows[table] ?? []), row];
    return {
      select() {
        return {
          async single() {
            return { data: row, error: null };
          },
        };
      },
    };
  }

  return {
    inserts,
    rows,
    rpcCalls,
    supabase: {
      from(table: string) {
        return {
          insert(payload: SupabaseMockRow) {
            inserts[table] = [...(inserts[table] ?? []), payload];
            return mutationResult(table, payload);
          },
          select() {
            return selectChain(table);
          },
          update(payload: SupabaseMockRow) {
            return updateChain(table, payload);
          },
          upsert(payload: SupabaseMockRow) {
            upserts[table] = [...(upserts[table] ?? []), payload];
            return mutationResult(table, payload);
          },
        };
      },
      rpc(fn: string, args: unknown) {
        rpcCalls.push({ args, fn });
        const handler = options.rpcHandlers?.[fn];
        if (handler) return Promise.resolve(handler(args));
        return Promise.resolve({ data: null, error: null });
      },
    },
    updates,
    upserts,
  };
}

export function createAdminContext(supabase: unknown, overrides: Partial<AdminContext> = {}): AdminContext {
  return {
    email: "owner@example.com",
    supabase,
    user: { id: "user-1" },
    userId: "user-1",
    ...overrides,
  } as AdminContext;
}
