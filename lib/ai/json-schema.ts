import { z, type ZodTypeAny } from "zod";

export function zodToProviderJsonSchema(schema: ZodTypeAny) {
  return z.toJSONSchema(schema);
}
