import "server-only";

import { parseServerEnv } from "./schema";

export const serverEnv = parseServerEnv(process.env);
