import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  AssumptionFlag,
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorFallback,
  Input,
  KeyValueRow,
  MetricBlock,
  RuleHeader,
  ScoreGauge,
  Select,
  Switch,
  Table,
  Textarea,
} from "@/components/design-system";
import {
  AppShell,
  CommandPaletteShell,
  Inspector,
  RouteScaffold,
  Sidebar,
  TopBar,
  appShellCommandItems,
  privateRouteShells,
  privateSidebarSections,
} from "@/components/app-shell";
import tailwindConfig from "@/tailwind.config";

describe("CreatorOS design-system token bridge", () => {
  it("exposes design token variables and light-mode overrides in global CSS", () => {
    const css = readFileSync(resolve(process.cwd(), "app/globals.css"), "utf8");

    expect(css).toContain("--bg-canvas: oklch(0.18 0.012 60)");
    expect(css).toContain("--border-hairline: 1px solid var(--rule-hairline)");
    expect(css).toContain("--color-accent: var(--accent-vermillion)");
    expect(css).toContain("[data-theme=\"light\"]");
    expect(css).toContain("body::before");
    expect(css).toContain("font-variant-caps: all-small-caps");
  });

  it("maps Tailwind theme tokens to CSS variables instead of literal colors", () => {
    const theme = tailwindConfig.theme;

    expect(theme.colors.canvas).toBe("var(--bg-canvas)");
    expect(theme.colors.surface2).toBe("var(--bg-surface-2)");
    expect(theme.colors.ink.primary).toBe("var(--ink-primary)");
    expect(theme.colors.accent.DEFAULT).toBe("var(--accent-vermillion)");
    expect(theme.borderColor.hairline).toBe("var(--rule-hairline)");
    expect(theme.fontFamily.display).toBe("var(--font-display)");
    expect(theme.spacing["0.5"]).toBe("var(--space-0_5)");
    expect(theme.borderRadius.md).toBe("var(--radius-md)");
  });
});

describe("CreatorOS design-system primitives", () => {
  it("renders button, field, badge, card, and rule-header anatomy", () => {
    const markup = renderToStaticMarkup(
      React.createElement(
        Card,
        { variant: "inset" },
        React.createElement(RuleHeader, {
          folio: "§ 03",
          label: "Design tokens",
          sub: "primitive pass",
          actions: React.createElement(Button, { size: "sm", loading: true }, "Sync"),
        }),
        React.createElement(Input, {
          id: "save-token",
          label: "Save token",
          mono: true,
          helper: "Shown once.",
        }),
        React.createElement(Textarea, {
          id: "draft-body",
          label: "Draft body",
          defaultValue: "Dense editorial field.",
        }),
        React.createElement(Select, {
          id: "status",
          label: "Status",
          defaultValue: "queued",
          options: [{ label: "Queued", value: "queued" }],
        }),
        React.createElement(Switch, {
          id: "voice-profile",
          label: "Use voice profile",
          checked: true,
          readOnly: true,
        }),
        React.createElement(Badge, { variant: "warning" }, "needs review"),
      ),
    );

    expect(markup).toContain("card card-inset");
    expect(markup).toContain("rule-header");
    expect(markup).toContain("btn btn-primary btn-sm btn-loading");
    expect(markup).toContain("btn-loading-bar");
    expect(markup).toContain("field-label smallcaps");
    expect(markup).toContain("field-input mono");
    expect(markup).toContain("field-input field-textarea");
    expect(markup).toContain("select-chevron");
    expect(markup).toContain("switch-track switch-track-on");
    expect(markup).toContain("badge badge-warning smallcaps");
  });

  it("renders dense data, metrics, scores, errors, and assumption flags", () => {
    const markup = renderToStaticMarkup(
      React.createElement(
        React.Fragment,
        null,
        React.createElement(Table, {
          columns: [
            { key: "draft", header: "Draft" },
            { key: "score", header: "Score", numeric: true },
          ],
          rows: [{ id: "draft-1", draft: "DRAFT-1", score: 82 }],
        }),
        React.createElement(MetricBlock, {
          label: "Scheduled",
          value: "08",
          delta: "+2 this week",
          tone: "up",
        }),
        React.createElement(ScoreGauge, { label: "Readiness", value: 82 }),
        React.createElement(KeyValueRow, { label: "Model", value: "mock-provider", mono: true }),
        React.createElement(ErrorFallback, {
          code: "§ E03",
          title: "Component failed",
          message: "Render fallback without leaking internals.",
          action: React.createElement(Button, { variant: "secondary" }, "Retry"),
        }),
        React.createElement(
          AssumptionFlag,
          {
            label: "Inference",
          },
          "This score is heuristic until analytics exist.",
        ),
        React.createElement(EmptyState, {
          glyph: "❦",
          title: "No drafts yet",
          message: "This module is scaffolded only.",
        }),
      ),
    );

    expect(markup).toContain("table-wrap");
    expect(markup).toContain("class=\"num smallcaps\"");
    expect(markup).toContain("metric-block");
    expect(markup).toContain("metric-delta metric-delta-up");
    expect(markup).toContain("score-gauge");
    expect(markup).toContain("role=\"meter\"");
    expect(markup).toContain("kv-row");
    expect(markup).toContain("error-fallback");
    expect(markup).toContain("assumption");
    expect(markup).toContain("empty-state");
  });

  it("defines the documented private route registry and navigation groups", () => {
    expect(privateRouteShells.map((route) => route.path)).toEqual([
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
      "/blogs/new",
      "/blogs/[id]",
      "/analytics",
      "/experiments",
      "/settings",
      "/settings/x-connection",
      "/settings/ai",
      "/settings/data",
      "/settings/tokens",
      "/settings/diagnostics",
    ]);

    expect(privateSidebarSections.map((section) => section.label)).toEqual([
      "§ Ⅰ — OPERATE",
      "§ Ⅱ — INTELLIGENCE",
      "§ Ⅲ — ARCHIVE",
      "§ Ⅳ — NETWORK",
      "§ Ⅴ — SYSTEM",
    ]);
    expect(privateSidebarSections.flatMap((section) => section.items.map((item) => item.href))).toEqual([
      "/dashboard",
      "/publishing",
      "/calendar",
      "/composer",
      "/brain-dump",
      "/coach",
      "/algo-analyzer",
      "/analytics",
      "/experiments",
      "/post-history",
      "/blogs",
      "/inspiration",
      "/reply-guy",
      "/account-research",
      "/campaigns",
      "/settings",
    ]);
  });

  it("renders pending route and command palette shells without feature-complete claims", () => {
    const dashboardShell = privateRouteShells[0]!;
    const markup = renderToStaticMarkup(
      React.createElement(
        React.Fragment,
        null,
        React.createElement(RouteScaffold, { route: dashboardShell }),
        React.createElement(CommandPaletteShell, {
          commands: appShellCommandItems,
          onClose: () => undefined,
          open: true,
        }),
      ),
    );

    expect(markup).toContain("route-scaffold");
    expect(markup).toContain("phase-pending");
    expect(markup).toContain("empty-state");
    expect(markup).toContain("command-palette-shell");
    expect(markup).toContain("role=\"dialog\"");
    expect(markup).toContain("pending implementation");
  });

  it("renders AppShell primitives without route wiring", () => {
    const markup = renderToStaticMarkup(
      React.createElement(
        AppShell,
        {
          sidebar: React.createElement(Sidebar, {
            brand: "CreatorOS",
            sections: [
              {
                label: "§ Ⅰ — OPERATE",
                items: [{ href: "/dashboard", label: "Dashboard", glyph: "§", active: true }],
              },
            ],
            status: "local only",
          }),
          topbar: React.createElement(TopBar, {
            crumbs: ["Operate", "Dashboard"],
            commandLabel: "⌘K",
          }),
          inspector: React.createElement(Inspector, { title: "Evidence" }, "No object selected."),
        },
        React.createElement("main", null, "Workbench"),
      ),
    );

    expect(markup).toContain("app-shell app-shell-inspector");
    expect(markup).toContain("sidebar-brand");
    expect(markup).toContain("sidebar-item sidebar-item-active");
    expect(markup).toContain("topbar-cmd");
    expect(markup).toContain("app-inspector");
  });
});
