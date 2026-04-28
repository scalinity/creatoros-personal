export const privateAppPathPrefixes = [
  "/dashboard",
  "/coach",
  "/algo-analyzer",
  "/composer",
  "/brain-dump",
  "/reply-guy",
  "/account-research",
  "/post-history",
  "/inspiration",
  "/publishing",
  "/calendar",
  "/campaigns",
  "/blogs",
  "/analytics",
  "/experiments",
  "/settings",
] as const;

export function isPrivateAppPath(pathname: string) {
  return privateAppPathPrefixes.some((pathPrefix) => pathname === pathPrefix || pathname.startsWith(`${pathPrefix}/`));
}

export function loginPathForError(error?: string) {
  if (!error) {
    return "/login";
  }

  const params = new URLSearchParams({ error });

  return `/login?${params.toString()}`;
}

