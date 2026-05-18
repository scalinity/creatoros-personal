// L-30: app shell uses a fixed two-column layout (sidebar + workspace).
// CreatorOS Personal is scoped by spec as a single-owner desktop cockpit;
// there is no mobile drawer/collapse mode because the product is not
// designed for mobile use. Documented in RUNBOOK.md "Local Development".
import type { HTMLAttributes, ReactNode } from "react";
import Link from "next/link";

import { Badge, Card, EmptyState, IconButton, RuleHeader, cn } from "@/components/design-system";

export type AppShellProps = HTMLAttributes<HTMLDivElement> & {
  inspector?: ReactNode;
  sidebar: ReactNode;
  topbar?: ReactNode;
};

export function AppShell({ children, className, inspector, sidebar, topbar, ...props }: AppShellProps) {
  return (
    <div className={cn("app-shell", inspector && "app-shell-inspector", className)} {...props}>
      {sidebar}
      <div className="app-main">
        {topbar}
        <div className="app-content">{children}</div>
      </div>
      {inspector ? <aside className="app-inspector">{inspector}</aside> : null}
    </div>
  );
}

export type SidebarItem = {
  active?: boolean;
  glyph: ReactNode;
  href: string;
  label: ReactNode;
};

export type SidebarSection = {
  items: SidebarItem[];
  label: string;
};

export const privateSidebarSections: SidebarSection[] = [
  {
    label: "§ Ⅰ — OPERATE",
    items: [
      { href: "/dashboard", label: "Dashboard", glyph: "§" },
      { href: "/publishing", label: "Publishing", glyph: "¶" },
      { href: "/calendar", label: "Calendar", glyph: "◷" },
      { href: "/composer", label: "Composer", glyph: "✎" },
      { href: "/brain-dump", label: "Brain Dump", glyph: "※" },
    ],
  },
  {
    label: "§ Ⅱ — INTELLIGENCE",
    items: [
      { href: "/coach", label: "Coach", glyph: "◇" },
      { href: "/algo-analyzer", label: "Algo Analyzer", glyph: "◎" },
      { href: "/analytics", label: "Analytics", glyph: "△" },
      { href: "/experiments", label: "Experiments", glyph: "✦" },
    ],
  },
  {
    label: "§ Ⅲ — ARCHIVE",
    items: [
      { href: "/post-history", label: "Post History", glyph: "▤" },
      { href: "/blogs", label: "Blogs", glyph: "▧" },
      { href: "/inspiration", label: "Inspiration", glyph: "❦" },
    ],
  },
  {
    label: "§ Ⅳ — NETWORK",
    items: [
      { href: "/reply-guy", label: "Reply Guy", glyph: "R" },
      { href: "/account-research", label: "Account Research", glyph: "⌕" },
      { href: "/campaigns", label: "Campaigns", glyph: "⌁" },
    ],
  },
  {
    label: "§ Ⅴ — SYSTEM",
    items: [{ href: "/settings", label: "Settings", glyph: "⚙" }],
  },
];

export type RouteShellCard = {
  body: ReactNode;
  label: ReactNode;
  status?: ReactNode;
};

export type RouteShellDefinition = {
  cards: RouteShellCard[];
  description: ReactNode;
  emptyMessage: ReactNode;
  emptyTitle: ReactNode;
  folio: string;
  id: string;
  inspectorNote?: ReactNode;
  path: string;
  title: string;
};

export const privateRouteShells: RouteShellDefinition[] = [
  {
    id: "dashboard",
    path: "/dashboard",
    folio: "§ 01",
    title: "Dashboard",
    description: "Dense private cockpit scaffold for status, queues, archive, performance, strategy, and daily suggestions.",
    emptyTitle: "NO DASHBOARD DATA",
    emptyMessage: "Status cards, queues, metrics, and suggestions are pending later implementation phases.",
    cards: [
      { label: "Status", body: "X connection, publishing permission, sync health, and AI readiness surfaces will land after auth and integrations.", status: "pending implementation" },
      { label: "Queue", body: "Due today, failed jobs, and approval counts are intentionally empty until publishing data exists.", status: "scaffold only" },
      { label: "Performance", body: "Post and growth metrics will be populated after import, sync, and analytics phases.", status: "pending data" },
    ],
  },
  {
    id: "coach",
    path: "/coach",
    folio: "§ 02",
    title: "Coach",
    description: "Evidence-first coaching shell for future internal retrieval and cited recommendations.",
    emptyTitle: "NO COACH THREAD",
    emptyMessage: "Chat, evidence drawer, and retrieval-backed recommendations are pending the AI and retrieval phases.",
    cards: [
      { label: "Evidence", body: "Future answers must cite internal posts, drafts, blogs, campaigns, and experiments.", status: "guardrail" },
      { label: "Suggested prompts", body: "Prompt chips are not interactive until the coach workflow is implemented.", status: "placeholder" },
    ],
    inspectorNote: "No evidence packet selected.",
  },
  {
    id: "algo-analyzer",
    path: "/algo-analyzer",
    folio: "§ 03",
    title: "Algo Analyzer",
    description: "Heuristic draft analyzer shell. This is not the official X algorithm.",
    emptyTitle: "NO DRAFT ANALYZED",
    emptyMessage: "Score cards, risk warnings, rewrites, and publish-readiness output are pending the AI foundation phase.",
    cards: [
      { label: "Heuristic notice", body: "All future scoring must stay labeled as heuristic unless backed by internal metrics.", status: "required" },
      { label: "Score set", body: "The documented nine-metric score surface is scaffolded here without calculations.", status: "pending" },
    ],
  },
  {
    id: "composer",
    path: "/composer",
    folio: "§ 04",
    title: "Composer",
    description: "Workbench shell for ideas, drafts, generated outputs, source inspection, and publishing handoff.",
    emptyTitle: "NO COMPOSER ITEMS",
    emptyMessage: "Idea inboxes, drafts, generated outputs, and content packs arrive in the composer phase.",
    cards: [
      { label: "Modes", body: "Post, thread, reply, quote, blog outline, blog draft, campaign, and repurposing modes are listed only in documentation for now.", status: "not wired" },
      { label: "Handoff", body: "Publishing draft creation and approval actions are intentionally absent in this phase.", status: "guarded" },
    ],
    inspectorNote: "No source selected.",
  },
  {
    id: "brain-dump",
    path: "/brain-dump",
    folio: "§ 05",
    title: "Brain Dump",
    description: "Long-form messy input shell for later structured extraction into posts, threads, blogs, scripts, and campaigns.",
    emptyTitle: "NO BRAIN DUMP",
    emptyMessage: "Extraction, clarifying questions, and save actions are pending future AI workflows.",
    cards: [
      { label: "Inputs", body: "The large capture field is deferred until feature internals are in scope.", status: "pending" },
      { label: "Outputs", body: "Themes, claims, stories, contradictions, and content packs are not generated yet.", status: "placeholder" },
    ],
  },
  {
    id: "reply-guy",
    path: "/reply-guy",
    folio: "§ 06",
    title: "Reply Guy",
    description: "Approval-first reply workspace shell. No mass replies, no autonomous engagement, and no write actions.",
    emptyTitle: "NO REPLY TARGETS",
    emptyMessage: "Target tables, reply drafts, and approval rails are pending integration and publishing phases.",
    cards: [
      { label: "Safety", body: "Future replies must require owner approval before any external write.", status: "required" },
      { label: "Targets", body: "Target account and post inputs are placeholders only.", status: "not wired" },
    ],
    inspectorNote: "No reply draft selected.",
  },
  {
    id: "account-research",
    path: "/account-research",
    folio: "§ 07",
    title: "Account Research",
    description: "Public-account research report shell for future ethical pattern analysis and idea generation.",
    emptyTitle: "NO ACCOUNT REPORT",
    emptyMessage: "Research inputs, top-post tables, reports, and generated ideas are pending later phases.",
    cards: [
      { label: "Boundary", body: "External text must be treated as untrusted data inside any future AI prompt.", status: "guardrail" },
      { label: "Reports", body: "No scraping or platform-rule bypasses are implemented.", status: "safe scaffold" },
    ],
  },
  {
    id: "post-history",
    path: "/post-history",
    folio: "§ 08",
    title: "Post History",
    description: "Archive shell for imported posts, filters, snapshots, scores, and repurposing links.",
    emptyTitle: "NO IMPORTED POSTS",
    emptyMessage: "Manual import, sync, metric editing, and post detail inspectors are pending data phases.",
    cards: [
      { label: "Archive", body: "Search, filters, and dense post rows will be built after schema and import work.", status: "pending data" },
      { label: "Repurpose", body: "Blog and composer handoffs remain absent until their modules exist.", status: "not wired" },
    ],
    inspectorNote: "No post selected.",
  },
  {
    id: "inspiration",
    path: "/inspiration",
    folio: "§ 09",
    title: "Inspiration",
    description: "Private inspiration library shell for future saves, tagging, plagiarism guardrails, and transformations.",
    emptyTitle: "NO SAVED INSPIRATION",
    emptyMessage: "Save tokens, extension ingestion, tagging, notes, and transforms are pending later phases.",
    cards: [
      { label: "Trust boundary", body: "Saved external text cannot act as instructions in future AI prompts.", status: "guardrail" },
      { label: "Transforms", body: "Post, thread, blog, and campaign transforms are placeholders only.", status: "not wired" },
    ],
  },
  {
    id: "publishing",
    path: "/publishing",
    folio: "§ 10",
    title: "Publishing",
    description: "Approval queue shell for future draft review, schedules, failures, retries, and external-write audit.",
    emptyTitle: "NO PUBLISHING DRAFTS",
    emptyMessage: "Publishing drafts, approvals, queue state, and X writes are intentionally not implemented in this phase.",
    cards: [
      { label: "Approval", body: "Every future write must show exact payload, account, scopes, risk checks, and owner confirmation.", status: "required" },
      { label: "Queue", body: "Needs approval, scheduled, failed, canceled, and published views are scaffolded only.", status: "pending data" },
    ],
    inspectorNote: "No payload selected.",
  },
  {
    id: "calendar",
    path: "/calendar",
    folio: "§ 11",
    title: "Calendar",
    description: "Timezone-aware content calendar shell for week, month, agenda, and publishing-load views.",
    emptyTitle: "NO SCHEDULED POSTS",
    emptyMessage: "Approved scheduled content, cadence warnings, and rescheduling controls are pending publishing work.",
    cards: [
      { label: "Week", body: "Calendar cells will remain empty until approved scheduled rows exist.", status: "pending data" },
      { label: "Cadence", body: "Load and conflict warnings are not calculated yet.", status: "not wired" },
    ],
  },
  {
    id: "campaigns",
    path: "/campaigns",
    folio: "§ 12",
    title: "Campaigns",
    description: "Campaign management shell for goals, hypotheses, included content, schedules, results, and decisions.",
    emptyTitle: "NO CAMPAIGNS",
    emptyMessage: "Campaign cards, linked content, and result interpretation are pending the growth system phase.",
    cards: [
      { label: "Planning", body: "Active, planned, completed, and archived views are placeholders only.", status: "pending" },
      { label: "Results", body: "Metrics and AI interpretation require analytics data before they can exist.", status: "pending data" },
    ],
  },
  {
    id: "blogs",
    path: "/blogs",
    folio: "§ 13",
    title: "Blogs",
    description: "Blog library shell for status, slug, tags, word count, export state, and linked X campaigns.",
    emptyTitle: "NO BLOG DRAFTS",
    emptyMessage: "Blog CRUD, filters, exports, and repurposing workflows are pending the blog system phase.",
    cards: [
      { label: "Library", body: "The future dense list/table is scaffolded without records.", status: "pending data" },
      { label: "Exports", body: "Markdown, HTML, JSON, and MDX-ready exports are not implemented yet.", status: "not wired" },
    ],
  },
  {
    id: "blogs-new",
    path: "/blogs/new",
    folio: "§ 14",
    title: "New Blog",
    description: "Blog creation shell for future blank starts, ideas, posts, brain dumps, inspiration, account reports, and campaign briefs.",
    emptyTitle: "NO BLOG SOURCE SELECTED",
    emptyMessage: "Creation sources, editor frames, and save behavior are pending the blog system phase.",
    cards: [
      { label: "Sources", body: "Blank, idea, post, brain dump, inspiration, report, and campaign brief starts are placeholders.", status: "not wired" },
      { label: "Editor", body: "The long-form writing frame is deferred until blog internals are in scope.", status: "pending" },
    ],
  },
  {
    id: "blogs-detail",
    path: "/blogs/[id]",
    folio: "§ 15",
    title: "Blog Detail",
    description: "Blog editor shell for metadata, versions, SEO, repurposing, export, and source evidence.",
    emptyTitle: "NO BLOG LOADED",
    emptyMessage: "Dynamic blog records, editor state, versions, and export panels are pending schema and blog phases.",
    cards: [
      { label: "Metadata", body: "Title, slug, tags, categories, and SEO fields are not wired to storage yet.", status: "pending data" },
      { label: "Versions", body: "Version history and restore controls are placeholders only.", status: "not wired" },
    ],
    inspectorNote: "No source evidence selected.",
  },
  {
    id: "analytics",
    path: "/analytics",
    folio: "§ 16",
    title: "Analytics",
    description: "Analytics dashboard shell for performance summaries, score explanations, hooks, topics, cadence, velocity, and growth.",
    emptyTitle: "NO ANALYTICS DATA",
    emptyMessage: "Deterministic analytics, charts, tables, and explanations are pending import, sync, and analytics phases.",
    cards: [
      { label: "Performance", body: "Metric blocks and dense tables will populate after post/blog data exists.", status: "pending data" },
      { label: "Cadence", body: "Heatmaps and velocity surfaces are not calculated yet.", status: "not wired" },
    ],
  },
  {
    id: "experiments",
    path: "/experiments",
    folio: "§ 17",
    title: "Experiments",
    description: "Experiment ledger shell for hypotheses, windows, content counts, metrics, decisions, and interpretations.",
    emptyTitle: "NO EXPERIMENTS",
    emptyMessage: "Experiment CRUD, included content, result metrics, and decision badges are pending growth and analytics phases.",
    cards: [
      { label: "Ledger", body: "Hook, topic, format, timing, CTA, reply strategy, and blog repurposing experiments are placeholders.", status: "pending" },
      { label: "Decisions", body: "AI interpretation must wait until ended experiments have evidence.", status: "pending data" },
    ],
    inspectorNote: "No experiment selected.",
  },
  {
    id: "settings",
    path: "/settings",
    folio: "§ 18",
    title: "Settings",
    description: "System settings shell for connection, AI, data, save tokens, and diagnostics sections.",
    emptyTitle: "NO SETTINGS WIRED",
    emptyMessage: "Configuration forms are scaffolded only; no secrets, tokens, or provider keys are exposed to the browser.",
    cards: [
      { label: "Security", body: "Future settings must show secret presence only, never secret values.", status: "required" },
      { label: "Sections", body: "X connection, AI, data, tokens, and diagnostics subroutes are available as shells.", status: "scaffolded" },
    ],
  },
  {
    id: "settings-x-connection",
    path: "/settings/x-connection",
    folio: "§ 19",
    title: "X Connection Settings",
    description: "X OAuth and capability shell for future least-privilege scopes, escalation, disconnect, and sync state.",
    emptyTitle: "NO X CONNECTION",
    emptyMessage: "OAuth, encrypted tokens, refresh, sync, metrics, and capability flags are pending later phases.",
    cards: [
      { label: "Scopes", body: "Read-centric scopes and write-scope escalation are not implemented yet.", status: "pending auth" },
      { label: "Capabilities", body: "Capability flags must be verified before future write controls appear.", status: "guardrail" },
    ],
  },
  {
    id: "settings-ai",
    path: "/settings/ai",
    folio: "§ 20",
    title: "AI Settings",
    description: "AI provider settings shell for future model routing, provider readiness, and diagnostics.",
    emptyTitle: "NO AI PROVIDER WIRED",
    emptyMessage: "Server-only AI provider clients, prompt registry, jobs, and prompt runs are pending the AI foundation phase.",
    cards: [
      { label: "Secrets", body: "AI keys must remain server-only and are not read or rendered here.", status: "required" },
      { label: "Routing", body: "Provider and model choices remain documentation-only until the AI layer exists.", status: "pending" },
    ],
  },
  {
    id: "settings-data",
    path: "/settings/data",
    folio: "§ 21",
    title: "Data Settings",
    description: "Data export, delete, import, and retention shell for future private data controls.",
    emptyTitle: "NO DATA CONTROLS WIRED",
    emptyMessage: "Export/delete workflows, import parsers, and diagnostics are pending schema and hardening phases.",
    cards: [
      { label: "Export", body: "No archive or export payload is generated in this phase.", status: "not wired" },
      { label: "Delete", body: "Destructive data operations are intentionally absent.", status: "guarded" },
    ],
  },
  {
    id: "settings-tokens",
    path: "/settings/tokens",
    folio: "§ 22",
    title: "Save Tokens",
    description: "Personal save-token shell for future extension ingestion, shown-once tokens, rotation, revocation, and rate limits.",
    emptyTitle: "NO SAVE TOKENS",
    emptyMessage: "Token generation, hashing, display-once behavior, and revocation are pending the extension phase.",
    cards: [
      { label: "Scope", body: "Future tokens may create inspiration only; they cannot read, publish, or call heavy AI endpoints.", status: "required" },
      { label: "Storage", body: "No token material is created or exposed in this scaffold.", status: "safe scaffold" },
    ],
  },
  {
    id: "settings-diagnostics",
    path: "/settings/diagnostics",
    folio: "§ 23",
    title: "Diagnostics",
    description: "Diagnostics shell for future sanitized config presence, last failures, rate limits, and capability state.",
    emptyTitle: "NO DIAGNOSTICS DATA",
    emptyMessage: "Diagnostics tables will show presence/missing and sanitized failures only after backing services exist.",
    cards: [
      { label: "Redaction", body: "Secrets, OAuth tokens, save tokens, and encryption material must never render in this route.", status: "required" },
      { label: "Health", body: "Service checks remain placeholder text until server diagnostics are expanded.", status: "pending" },
    ],
  },
];

export function getRouteShell(path: string) {
  return privateRouteShells.find((route) => route.path === path);
}

export type CommandPaletteItem = {
  group: string;
  href: string;
  id: string;
  label: string;
};

export const appShellCommandItems: CommandPaletteItem[] = [
  { id: "write-post", group: "Operate", label: "Write post", href: "/composer" },
  { id: "compose-thread", group: "Operate", label: "Compose thread", href: "/composer" },
  { id: "draft-blog", group: "Archive", label: "Draft blog", href: "/blogs/new" },
  { id: "analyze-draft", group: "Intelligence", label: "Analyze draft", href: "/algo-analyzer" },
  { id: "schedule-approved", group: "Operate", label: "Schedule approved draft", href: "/publishing" },
  { id: "review-queue", group: "Operate", label: "Review publishing queue", href: "/publishing" },
  { id: "import-posts", group: "Archive", label: "Import posts", href: "/post-history" },
  { id: "research-account", group: "Network", label: "Research account", href: "/account-research" },
  { id: "save-inspiration", group: "Archive", label: "Save inspiration", href: "/inspiration" },
  { id: "create-experiment", group: "Intelligence", label: "Create experiment", href: "/experiments" },
  { id: "export-data", group: "System", label: "Export data", href: "/settings/data" },
];

export function RouteScaffold({ route }: { route: RouteShellDefinition }) {
  return (
    <main aria-labelledby={`${route.id}-title`} className="route-scaffold">
      <RuleHeader
        actions={<Badge variant="outline">phase pending</Badge>}
        folio={route.folio}
        label={route.title}
        sub="scaffold only"
      />
      <section className="route-hero" aria-label={`${route.title} status`}>
        <div>
          <p className="route-kicker smallcaps">private workstation</p>
          <h1 className="route-title" id={`${route.id}-title`}>
            {route.title}
          </h1>
          <p className="route-description">{route.description}</p>
        </div>
        <Badge className="phase-pending" variant="warning">
          pending implementation
        </Badge>
      </section>
      <div className="route-grid">
        <Card className="route-empty-card" variant="inset">
          <Card.Body>
            <EmptyState glyph="❦" message={route.emptyMessage} title={route.emptyTitle} />
          </Card.Body>
        </Card>
        {route.cards.map((card) => (
          <Card className="route-card" key={String(card.label)}>
            <Card.Header>
              <span className="route-card-title smallcaps">{card.label}</span>
              {card.status ? <Badge variant="outline">{card.status}</Badge> : null}
            </Card.Header>
            <Card.Body>
              <p className="route-card-body">{card.body}</p>
            </Card.Body>
          </Card>
        ))}
      </div>
    </main>
  );
}

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
        <div className="command-palette-list" role="list">
          {groups.map((group) => (
            <section className="command-palette-group" key={group}>
              <h2 className="command-palette-group-label smallcaps">{group}</h2>
              {commands
                .filter((command) => command.group === group)
                .map((command) => (
                  <a className="command-palette-row" href={command.href} key={command.id} onClick={onClose} role="listitem">
                    <span className="command-palette-row-label">{command.label}</span>
                    <Badge variant="outline">pending</Badge>
                  </a>
                ))}
            </section>
          ))}
        </div>
      </section>
    </div>
  );
}

export type SidebarProps = HTMLAttributes<HTMLElement> & {
  brand?: ReactNode;
  collapsed?: boolean;
  sections: SidebarSection[];
  status?: ReactNode;
};

export function Sidebar({ brand = "CreatorOS", className, collapsed = false, sections, status, ...props }: SidebarProps) {
  return (
    <nav className={cn("sidebar", collapsed && "sidebar-collapsed", className)} aria-label="Primary" {...props}>
      <div className="sidebar-brand">
        <span className="sidebar-mark smallcaps">{brand}</span>
        <span className="sidebar-folio mono">Ⅰ</span>
      </div>
      <div className="sidebar-nav">
        {sections.map((section) => (
          <section className="sidebar-section" key={section.label}>
            <div className="sidebar-section-label smallcaps">{section.label}</div>
            {section.items.map((item) => (
              <Link
                aria-current={item.active ? "page" : undefined}
                className={cn("sidebar-item", item.active && "sidebar-item-active")}
                // The sidebar carries dynamically-built hrefs (admin-configured
                // route catalog), so we step out of `typedRoutes` here. The
                // route values still come from the curated `privateSidebarSections`
                // map — there are no untyped strings reaching this anchor.
                href={item.href as unknown as never}
                key={item.href}
              >
                <span className="sidebar-icon mono" aria-hidden="true">
                  {item.glyph}
                </span>
                <span className="sidebar-label smallcaps">{item.label}</span>
              </Link>
            ))}
          </section>
        ))}
      </div>
      {status ? (
        <div className="sidebar-foot">
          <span aria-hidden="true" className="status-dot status-ochre" />
          <span className="sidebar-status">{status}</span>
        </div>
      ) : null}
    </nav>
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

export type InspectorProps = HTMLAttributes<HTMLDivElement> & {
  title?: ReactNode;
};

export function Inspector({ children, className, title, ...props }: InspectorProps) {
  return (
    <div className={cn("inspector", className)} {...props}>
      {title ? <RuleHeader folio="§" label={title} /> : null}
      {children}
    </div>
  );
}
