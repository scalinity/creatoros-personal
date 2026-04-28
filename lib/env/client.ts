import { parseClientEnv } from "./schema";

export const clientEnv = parseClientEnv({
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
});
