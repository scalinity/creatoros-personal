"use client";

import { useMemo, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";

import {
  AppShell,
  CommandPaletteShell,
  Inspector,
  Sidebar,
  TopBar,
  appShellCommandItems,
  privateRouteShells,
  privateSidebarSections,
} from "@/components/app-shell";
import { Badge, KeyValueRow } from "@/components/design-system";
import { useMountEffect } from "@/components/app-shell/use-mount-effect";

type PrivateAppShellProps = {
  children: ReactNode;
  logoutAction: () => void;
  viewerEmail: string;
};

function isActivePath(pathname: string, href: string) {
  return pathname === href || (href !== "/dashboard" && pathname.startsWith(`${href}/`));
}

function routeForPath(pathname: string) {
  if (pathname !== "/blogs/new" && pathname.startsWith("/blogs/")) {
    return privateRouteShells.find((route) => route.path === "/blogs/[id]");
  }

  return (
    privateRouteShells.find((route) => route.path === pathname) ??
    privateRouteShells.find((route) => route.path !== "/dashboard" && pathname.startsWith(`${route.path}/`)) ??
    privateRouteShells.find((route) => route.path === "/dashboard")
  );
}

export function PrivateAppShell({ children, logoutAction, viewerEmail }: PrivateAppShellProps) {
  const pathname = usePathname();
  const [commandOpen, setCommandOpen] = useState(false);
  const currentRoute = routeForPath(pathname);
  const activeSections = useMemo(
    () =>
      privateSidebarSections.map((section) => ({
        ...section,
        items: section.items.map((item) => ({
          ...item,
          active: isActivePath(pathname, item.href),
        })),
      })),
    [pathname],
  );

  useMountEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const wantsCommand = (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k";

      if (wantsCommand) {
        event.preventDefault();
        setCommandOpen(true);
      }

      if (event.key === "Escape") {
        setCommandOpen(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  });

  return (
    <>
      <AppShell
        inspector={
          <Inspector title="Workspace Status">
            <div className="inspector-stack">
              <KeyValueRow label="Phase" value="11 AI foundation" />
              <KeyValueRow label="Auth" value="allowlisted admin" />
              <KeyValueRow label="Admin" mono value={viewerEmail} />
              <KeyValueRow label="Data" value="AI runs guarded" />
              <KeyValueRow label="Route" mono value={currentRoute?.path ?? pathname} />
              <Badge variant="success">private session</Badge>
              <p className="inspector-note">
                App routes and server handlers require Supabase session plus ADMIN_EMAILS allowlist. The AI foundation now provides
                server-only providers, prompt registry, structured output validation, and safe run logging; feature-specific AI workflows
                and publishing handoff remain later phases.
              </p>
            </div>
          </Inspector>
        }
        sidebar={<Sidebar sections={activeSections} status="admin session" />}
        topbar={
          <TopBar
            actions={
              <form action={logoutAction} className="topbar-auth">
                <span className="topbar-admin mono">{viewerEmail}</span>
                <button className="topbar-signout smallcaps" type="submit">
                  Logout
                </button>
              </form>
            }
            commandLabel="⌘K"
            crumbs={["CreatorOS Personal", currentRoute?.title ?? "Workspace"]}
            onCommandOpen={() => setCommandOpen(true)}
            syncStatus={<><span aria-hidden="true" className="status-dot status-moss" /> authenticated</>}
          />
        }
      >
        {children}
      </AppShell>
      <CommandPaletteShell
        commands={appShellCommandItems}
        onClose={() => setCommandOpen(false)}
        open={commandOpen}
      />
    </>
  );
}
