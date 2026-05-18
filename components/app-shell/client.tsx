"use client";

// SCA-508 (S-2): client-only app-shell exports — CommandPaletteShell and
// TopBar both bind interactive handlers (onClick, onCommandOpen, onClose)
// that require client-component runtime. Pulling them into a dedicated
// "use client" file means a direct server-component import of
// `@/components/app-shell` (which now contains only server-safe data and
// layout primitives) does not implicitly cross the client boundary.
//
// The legacy entrypoint `@/components/app-shell` re-exports these for
// backwards compatibility — Next.js bundles the client module separately
// thanks to the directive here, so the re-export from a server-safe
// module is valid.

import Link from "next/link";
import type { HTMLAttributes, ReactNode } from "react";

import { Badge, IconButton, RuleHeader, cn } from "@/components/design-system";

import type { CommandPaletteItem } from "./shared";

export type CommandPaletteShellProps = HTMLAttributes<HTMLDivElement> & {
  commands: CommandPaletteItem[];
  onClose: () => void;
  open: boolean;
};

export function CommandPaletteShell({ className, commands, onClose, open, ...props }: CommandPaletteShellProps) {
  if (!open) return null;

  const groups = Array.from(new Set(commands.map((command) => command.group)));

  return (
    <div
      className={cn("command-palette-overlay", className)}
      // Backdrop click closes; the inner section stops propagation so clicks on
      // the dialog itself do not dismiss it.
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      {...props}
    >
      <section
        aria-labelledby="command-palette-title"
        aria-modal="true"
        className="command-palette-shell"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
      >
        <RuleHeader
          actions={<IconButton label="Close command palette" onClick={onClose}>×</IconButton>}
          folio="⌘"
          // The id below is referenced by aria-labelledby so screen readers
          // announce the dialog name when focus enters.
          id="command-palette-title"
          label="Command Palette"
          sub="pending implementation"
        />
        <ul className="command-palette-list">
          {groups.map((group) => (
            <li className="command-palette-group" key={group}>
              <h2 className="command-palette-group-label smallcaps">{group}</h2>
              <ul>
                {commands
                  .filter((command) => command.group === group)
                  .map((command) => (
                    // SCA-531 (S-25): use <Link> inside <li> so the <a>
                    // retains its native link role and we get client-side
                    // navigation.
                    <li key={command.id}>
                      <Link className="command-palette-row" href={command.href} onClick={onClose}>
                        <span className="command-palette-row-label">{command.label}</span>
                        <Badge variant="outline">pending</Badge>
                      </Link>
                    </li>
                  ))}
              </ul>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

export type TopBarProps = HTMLAttributes<HTMLElement> & {
  actions?: ReactNode;
  commandAriaLabel?: string;
  commandDisabled?: boolean;
  commandLabel?: ReactNode;
  crumbs?: ReactNode[];
  onCommandOpen?: () => void;
  syncStatus?: ReactNode;
};

export function TopBar({
  actions,
  className,
  commandAriaLabel = "Open command palette",
  commandDisabled = false,
  commandLabel,
  crumbs = [],
  onCommandOpen,
  syncStatus,
  ...props
}: TopBarProps) {
  return (
    <header className={cn("topbar", className)} {...props}>
      <div className="topbar-crumbs">
        {crumbs.map((crumb, index) => (
          <span className="topbar-crumb" key={`${String(crumb)}-${index}`}>
            {index > 0 ? (
              <span aria-hidden="true" className="topbar-sep">
                /
              </span>
            ) : null}
            {crumb}
          </span>
        ))}
      </div>
      <div className="topbar-actions">
        {syncStatus ? <span className="topbar-sync">{syncStatus}</span> : null}
        {commandLabel ? (
          <button
            aria-haspopup="dialog"
            aria-label={commandAriaLabel}
            className="topbar-cmd mono"
            disabled={commandDisabled}
            onClick={onCommandOpen}
            type="button"
          >
            {commandLabel}
          </button>
        ) : null}
        {actions}
      </div>
    </header>
  );
}
