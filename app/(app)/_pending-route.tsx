import { notFound } from "next/navigation";

import { RouteScaffold, getRouteShell } from "@/components/app-shell";

export function PendingRoutePage({ path }: { path: string }) {
  const route = getRouteShell(path);

  if (!route) {
    notFound();
  }

  return <RouteScaffold route={route} />;
}
