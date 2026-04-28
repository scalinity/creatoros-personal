/* CreatorOS — All Components (Primitives + Composites + Domain + Shell)
 * Single file, organized by phase. Babel-transpiled.
 * NOTE: each component is exported to window at the bottom.
 */
const { useState, useEffect, useRef, useCallback, forwardRef, createContext, useContext } = React;

// ================================================================
// HELPERS
// ================================================================
const cn = (...args) => args.filter(Boolean).join(" ");

const usePrefersReducedMotion = () => {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const h = (e) => setReduced(e.matches);
    mq.addEventListener("change", h);
    return () => mq.removeEventListener("change", h);
  }, []);
  return reduced;
};

// ================================================================
// PHASE 2 — PRIMITIVES
// ================================================================

// Button
const Button = forwardRef(({ variant = "primary", size = "md", loading, children, className, ...rest }, ref) => {
  const sizes = { sm: "btn-sm", md: "btn-md", lg: "btn-lg" };
  return (
    <button ref={ref} className={cn("btn", `btn-${variant}`, sizes[size], loading && "btn-loading", className)} disabled={loading || rest.disabled} {...rest}>
      <span className="btn-label">{children}</span>
      {loading && <span className="btn-loading-bar" aria-hidden="true" />}
    </button>
  );
});

// Input (editorial: bottom rule only)
const Input = forwardRef(({ label, error, helper, mono, className, id, ...rest }, ref) => {
  const inputId = id || `in-${Math.random().toString(36).slice(2, 8)}`;
  return (
    <div className={cn("field", error && "field-error", className)}>
      {label && <label htmlFor={inputId} className="field-label smallcaps">{label}</label>}
      <input ref={ref} id={inputId} className={cn("field-input", mono && "mono")} {...rest} />
      {(error || helper) && <div className={cn("field-helper", error && "field-helper-error")}>{error || helper}</div>}
    </div>
  );
});

const Textarea = forwardRef(({ label, error, helper, mono, autoGrow = true, className, id, ...rest }, ref) => {
  const inputId = id || `ta-${Math.random().toString(36).slice(2, 8)}`;
  const innerRef = useRef(null);
  const setRef = (el) => { innerRef.current = el; if (typeof ref === "function") ref(el); else if (ref) ref.current = el; };
  const handleInput = (e) => { if (autoGrow && innerRef.current) { innerRef.current.style.height = "auto"; innerRef.current.style.height = innerRef.current.scrollHeight + "px"; } if (rest.onInput) rest.onInput(e); };
  return (
    <div className={cn("field", error && "field-error", className)}>
      {label && <label htmlFor={inputId} className="field-label smallcaps">{label}</label>}
      <textarea ref={setRef} id={inputId} className={cn("field-input field-textarea", mono && "mono")} onInput={handleInput} {...rest} />
      {(error || helper) && <div className={cn("field-helper", error && "field-helper-error")}>{error || helper}</div>}
    </div>
  );
});

// Select (native, restyled)
const Select = forwardRef(({ label, options = [], className, id, ...rest }, ref) => {
  const inputId = id || `sel-${Math.random().toString(36).slice(2, 8)}`;
  return (
    <div className={cn("field", className)}>
      {label && <label htmlFor={inputId} className="field-label smallcaps">{label}</label>}
      <div className="select-wrap">
        <select ref={ref} id={inputId} className="field-input select" {...rest}>
          {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <span className="select-chevron" aria-hidden="true">▾</span>
      </div>
    </div>
  );
});

// Checkbox (custom ink stroke)
const Checkbox = ({ label, checked, onChange, id, ...rest }) => {
  const inputId = id || `cb-${Math.random().toString(36).slice(2, 8)}`;
  return (
    <label htmlFor={inputId} className="checkbox-row">
      <input id={inputId} type="checkbox" className="checkbox-native" checked={!!checked} onChange={(e) => onChange && onChange(e.target.checked)} {...rest} />
      <span className="checkbox-box" aria-hidden="true">
        <svg viewBox="0 0 14 14" className="checkbox-glyph"><path d="M2 7.5 Q4 9, 5.5 10.5 Q7.5 8, 12 3.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </span>
      {label && <span className="checkbox-label">{label}</span>}
    </label>
  );
};

// Switch (rectangle track, ink block thumb)
const Switch = ({ label, checked, onChange, id, ...rest }) => {
  const inputId = id || `sw-${Math.random().toString(36).slice(2, 8)}`;
  return (
    <label htmlFor={inputId} className="switch-row">
      <input id={inputId} type="checkbox" className="switch-native" checked={!!checked} onChange={(e) => onChange && onChange(e.target.checked)} {...rest} />
      <span className={cn("switch-track", checked && "switch-track-on")} aria-hidden="true">
        <span className="switch-thumb" />
      </span>
      {label && <span className="switch-label">{label}</span>}
    </label>
  );
};

// Badge / Tag — flat
const Badge = ({ variant = "neutral", smallcaps = true, children, className }) => (
  <span className={cn("badge", `badge-${variant}`, smallcaps && "smallcaps", className)}>{children}</span>
);

// Tooltip (CSS-only, hover-delayed)
const Tooltip = ({ content, children, side = "top" }) => (
  <span className="tt-wrap">
    {children}
    <span className={cn("tt", `tt-${side}`)} role="tooltip">{content}</span>
  </span>
);

// Dialog
const Dialog = ({ open, onClose, title, children, footer }) => {
  useEffect(() => {
    if (!open) return;
    const h = (e) => e.key === "Escape" && onClose && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="dialog-backdrop" onClick={onClose}>
      <div className="dialog" role="dialog" aria-modal="true" aria-labelledby="dialog-title" onClick={(e) => e.stopPropagation()}>
        <div className="dialog-header">
          <h3 id="dialog-title" className="dialog-title">{title}</h3>
          <button className="icon-btn" aria-label="Close" onClick={onClose}>✕</button>
        </div>
        <hr className="hr-hairline" />
        <div className="dialog-body">{children}</div>
        {footer && <div className="dialog-footer">{footer}</div>}
      </div>
    </div>
  );
};

// Sheet (right-slide)
const Sheet = ({ open, onClose, title, children, side = "right" }) => {
  if (!open) return null;
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <aside className={cn("sheet", `sheet-${side}`)} role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-header">
          <RuleHeader folio="§ Ⅰ" label={title} actions={<button className="icon-btn" aria-label="Close" onClick={onClose}>✕</button>} />
        </div>
        <div className="sheet-body">{children}</div>
      </aside>
    </div>
  );
};

// Tabs (underline only)
const Tabs = ({ tabs = [], value, onChange }) => (
  <div className="tabs" role="tablist">
    {tabs.map((t) => (
      <button
        key={t.value}
        role="tab"
        aria-selected={value === t.value}
        className={cn("tab", value === t.value && "tab-active", "smallcaps")}
        onClick={() => onChange && onChange(t.value)}
      >{t.label}</button>
    ))}
  </div>
);

// Toast (controlled by ToastHost)
const Toast = ({ variant = "neutral", title, body, onDismiss, duration = 4000 }) => {
  useEffect(() => {
    if (!duration) return;
    const t = setTimeout(() => onDismiss && onDismiss(), duration);
    return () => clearTimeout(t);
  }, [duration, onDismiss]);
  return (
    <div className={cn("toast", `toast-${variant}`)}>
      <div className="toast-body">
        {title && <div className="toast-title smallcaps">{title}</div>}
        {body && <div className="toast-text">{body}</div>}
      </div>
      <button className="icon-btn icon-btn-sm" aria-label="Dismiss" onClick={onDismiss}>✕</button>
      {duration && <span className="toast-progress" style={{ animationDuration: `${duration}ms` }} />}
    </div>
  );
};

// ================================================================
// PHASE 3 — DATA + CONTENT COMPOSITES
// ================================================================

// FolioMark
const FolioMark = ({ symbol = "§", number, className }) => (
  <span className={cn("folio-mark", "folio", className)}>{symbol} {typeof number === "number" ? String(number).padStart(2, "0") : number}</span>
);

// RuleHeader — signature
const RuleHeader = ({ folio, label, sub, actions, className }) => (
  <header className={cn("rule-header", className)}>
    <div className="rule-header-row">
      <div className="rule-header-left">
        {folio && <span className="folio">{folio}</span>}
        <span className="rule-header-sep">—</span>
        <span className="rule-header-label smallcaps">{label}</span>
        {sub && <span className="rule-header-sub">{sub}</span>}
      </div>
      {actions && <div className="rule-header-actions">{actions}</div>}
    </div>
    <hr className="hr-hairline" />
  </header>
);

// Card with slots
const Card = ({ variant = "default", children, className }) => (
  <div className={cn("card", `card-${variant}`, className)}>{children}</div>
);
Card.Header = ({ children, className }) => <div className={cn("card-header", className)}>{children}</div>;
Card.Body = ({ children, className }) => <div className={cn("card-body", className)}>{children}</div>;
Card.Footer = ({ children, className }) => <div className={cn("card-footer", className)}>{children}</div>;
Card.RuleHeader = RuleHeader;

// KeyValueRow
const KeyValueRow = ({ k, children, mono }) => (
  <div className="kv-row">
    <div className="kv-key smallcaps">{k}</div>
    <div className={cn("kv-val", mono && "mono")}>{children}</div>
  </div>
);

// Table
const Table = ({ columns = [], rows = [], onRowClick, selectedId }) => {
  const [sort, setSort] = useState({ col: null, dir: "asc" });
  const sorted = (() => {
    if (!sort.col) return rows;
    const col = columns.find((c) => c.key === sort.col);
    if (!col) return rows;
    return [...rows].sort((a, b) => {
      const va = a[sort.col], vb = b[sort.col];
      if (va === vb) return 0;
      const cmp = va > vb ? 1 : -1;
      return sort.dir === "asc" ? cmp : -cmp;
    });
  })();
  const toggle = (k) => setSort((s) => s.col === k ? { col: k, dir: s.dir === "asc" ? "desc" : "asc" } : { col: k, dir: "asc" });
  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.key} className={cn(c.numeric && "num", "smallcaps")} onClick={() => c.sortable && toggle(c.key)} style={{ cursor: c.sortable ? "pointer" : "default" }}>
                {c.label}
                {c.sortable && <span className="table-sort">{sort.col === c.key ? (sort.dir === "asc" ? "▲" : "▼") : "▵"}</span>}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((r, i) => (
            <tr key={r.id ?? i} className={cn(selectedId === r.id && "row-selected")} onClick={() => onRowClick && onRowClick(r)}>
              {columns.map((c) => (
                <td key={c.key} className={cn(c.numeric && "num")}>{c.render ? c.render(r) : r[c.key]}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

// Pagination
const Pagination = ({ page, total, onChange }) => {
  const pad = (n) => String(n).padStart(2, "0");
  return (
    <div className="pagination">
      <button className="icon-btn" disabled={page <= 1} onClick={() => onChange(Math.max(1, page - 1))} aria-label="Previous">‹</button>
      <span className="pagination-text mono">{pad(page)} of {pad(total)}</span>
      <button className="icon-btn" disabled={page >= total} onClick={() => onChange(Math.min(total, page + 1))} aria-label="Next">›</button>
    </div>
  );
};

// EmptyState
const EmptyState = ({ ornament = "❦", title, body, action }) => (
  <div className="empty-state">
    <div className="empty-ornament">{ornament}</div>
    <div className="empty-title smallcaps">{title}</div>
    {body && <p className="empty-body">{body}</p>}
    {action && <div className="empty-action">{action}</div>}
  </div>
);

// LoadingSkeleton
const LoadingSkeleton = ({ width = "100%", height = 16, className }) => (
  <div className={cn("skel", className)} style={{ width, height }} />
);

// ErrorBoundary fallback (presentational)
const ErrorFallback = ({ code = "500", title = "INTERNAL ERROR", body, action }) => (
  <div className="error-fallback">
    <div className="error-folio mono">§ {code}</div>
    <div className="error-title smallcaps">{title}</div>
    {body && <p className="error-body">{body}</p>}
    {action && <div className="error-action">{action}</div>}
  </div>
);

// ================================================================
// PHASE 4 — APP-SPECIFIC COMPOSITES
// ================================================================

// Count-up hook
const useCountUp = (target, duration = 600) => {
  const reduced = usePrefersReducedMotion();
  const [v, setV] = useState(reduced ? target : 0);
  useEffect(() => {
    if (reduced) { setV(target); return; }
    let raf, start;
    const ease = (t) => 1 - Math.pow(1 - t, 3);
    const step = (ts) => {
      if (!start) start = ts;
      const p = Math.min(1, (ts - start) / duration);
      setV(target * ease(p));
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, duration, reduced]);
  return v;
};

// ScoreGauge
const ScoreGauge = ({ score, label, max = 10, variant = "default" }) => {
  const v = useCountUp(score, 700);
  const pct = (v / max) * 100;
  return (
    <div className={cn("score-gauge", `score-${variant}`)}>
      <div className="score-value">{v.toFixed(1)}<span className="score-max"> / {max}</span></div>
      <div className="score-track">
        <div className="score-fill" style={{ width: `${pct}%` }} />
        <span className="score-tick score-tick-min mono">0</span>
        <span className="score-tick score-tick-max mono">{max}</span>
      </div>
      <div className="score-label smallcaps">{label}</div>
    </div>
  );
};

// MetricBlock
const MetricBlock = ({ value, label, delta, deltaDir }) => (
  <div className="metric-block">
    <div className="metric-value mono">{value}</div>
    <div className="metric-label smallcaps">{label}</div>
    {delta && (
      <div className={cn("metric-delta", "mono", `metric-delta-${deltaDir || "up"}`)}>
        <span aria-hidden="true">{deltaDir === "down" ? "▼" : "▲"}</span> {delta}
      </div>
    )}
  </div>
);

// ConfidenceLabel
const ConfidenceLabel = ({ kind = "FACT" }) => {
  const variant = kind === "FACT" ? "success" : kind === "INFERENCE" ? "warning" : "danger";
  return <Badge variant={variant} className="conf-label">{kind}</Badge>;
};

// PostRow
const PostRow = ({ post, onClick, selected }) => (
  <article className={cn("post-row", selected && "post-row-selected")} onClick={onClick} role={onClick ? "button" : undefined} tabIndex={onClick ? 0 : -1}>
    <div className="post-row-head">
      <span className="post-author mono">@{post.author}</span>
      <span className="post-time mono">{post.time}</span>
    </div>
    <p className="post-text">{post.text}</p>
    <div className="post-row-foot">
      <span className="post-metric mono"><span className="post-icon">♥</span> {post.likes}</span>
      <span className="post-metric mono"><span className="post-icon">↺</span> {post.reposts}</span>
      <span className="post-metric mono"><span className="post-icon">↩</span> {post.replies}</span>
      <span className="post-metric mono"><span className="post-icon">❝</span> {post.quotes}</span>
      <span className="post-metric mono"><span className="post-icon">◉</span> {post.views}</span>
      <span className="post-engagement mono">{post.engagement}</span>
    </div>
  </article>
);

// RewriteCard
const RewriteCard = ({ index, kind, original, rewrite, score, showDiff }) => (
  <Card>
    <Card.Header>
      <span className="folio">REWRITE {String(index).padStart(2, "0")}</span>
      <span className="rule-header-sep">—</span>
      <span className="smallcaps rewrite-kind">{kind}</span>
    </Card.Header>
    <hr className="hr-hairline" />
    <Card.Body>
      {showDiff && original && (
        <div className="rewrite-diff">
          <span className="diff-strike">{original}</span>
        </div>
      )}
      <p className="rewrite-text">{rewrite}</p>
    </Card.Body>
    <hr className="hr-hairline" />
    <Card.Footer>
      <ScoreGauge score={score} label="rewrite score" />
      <div className="rewrite-actions">
        <Button variant="tertiary" size="sm">Copy</Button>
        <Button variant="tertiary" size="sm">Save</Button>
        <Button variant="primary" size="sm">Use</Button>
      </div>
    </Card.Footer>
  </Card>
);

// VoiceProfileCard
const VoiceProfileCard = ({ profile }) => (
  <Card>
    <Card.RuleHeader folio="§ Ⅱ" label="VOICE PROFILE" sub={`Generated ${profile.generated} · ${profile.posts} posts analyzed`} actions={<Button variant="tertiary" size="sm">Regenerate</Button>} />
    <Card.Body>
      <KeyValueRow k="Tone">{profile.tone}</KeyValueRow>
      <KeyValueRow k="Avg sentence" mono>{profile.avgSentence} words</KeyValueRow>
      <KeyValueRow k="Hook patterns">{profile.hooks}</KeyValueRow>
      <KeyValueRow k="Common phrases">{profile.phrases}</KeyValueRow>
      <KeyValueRow k="CTA patterns">{profile.ctas}</KeyValueRow>
    </Card.Body>
    <Card.Footer>
      <span className="folio">Last refreshed {profile.refreshed}</span>
    </Card.Footer>
  </Card>
);

// ChatMessage
const ChatMessage = ({ role, text, citations = [], streaming, confidence }) => (
  <div className={cn("chat-msg", `chat-msg-${role}`)}>
    <div className="chat-attr mono">{role === "user" ? "you" : "coach"}</div>
    <div className="chat-bubble">
      {role === "assistant" && <span className="chat-ornament">❦</span>}
      <span className="chat-text">{text}</span>
      {citations.map((c, i) => (
        <sup key={i} className="chat-cite folio" title={c}>{i + 1}</sup>
      ))}
      {confidence && <ConfidenceLabel kind={confidence} />}
      {streaming && <span className="chat-cursor" aria-hidden="true" />}
    </div>
  </div>
);

// ReplyDraftCard
const ReplyDraftCard = ({ parent, draft, kind }) => (
  <Card>
    <Card.Body>
      <blockquote className="reply-parent">
        <div className="reply-parent-author mono">@{parent.author}</div>
        <div className="reply-parent-text">{parent.text}</div>
      </blockquote>
      <div className="reply-kind"><Badge variant="accent">{kind}</Badge></div>
      <p className="reply-text">{draft}</p>
    </Card.Body>
    <hr className="hr-hairline" />
    <Card.Footer>
      <Button variant="tertiary" size="sm">Copy</Button>
      <Button variant="tertiary" size="sm">Save</Button>
      <Button variant="tertiary" size="sm">Mark Used</Button>
      <Button variant="tertiary" size="sm">Open Original</Button>
    </Card.Footer>
  </Card>
);

// InspirationCard
const InspirationCard = ({ post, plagiarismRisk, notes }) => (
  <Card>
    <Card.Body>
      <PostRow post={post} />
      {plagiarismRisk && (
        <div className="plagiarism">
          <Badge variant="warning">PLAGIARISM RISK</Badge>
          <span className="plagiarism-note">{plagiarismRisk}</span>
        </div>
      )}
      <div className="inspiration-actions">
        <Button variant="secondary" size="sm">Transform</Button>
        <Button variant="secondary" size="sm">Counterpoint</Button>
        <Button variant="secondary" size="sm">My Version</Button>
        <Button variant="secondary" size="sm">10 Variations</Button>
      </div>
      {notes && <div className="inspiration-notes">{notes}</div>}
    </Card.Body>
  </Card>
);

// AssumptionFlag
const AssumptionFlag = ({ children, onDismiss }) => (
  <aside className="assumption">
    <span className="assumption-bar" aria-hidden="true" />
    <div className="assumption-body">
      <span className="smallcaps assumption-label">Assumption</span>
      <span className="assumption-text">{children}</span>
    </div>
    {onDismiss && <button className="icon-btn icon-btn-sm" aria-label="Dismiss" onClick={onDismiss}>✕</button>}
  </aside>
);

// ================================================================
// PHASE 5 — LAYOUT
// ================================================================

// Sidebar
const Sidebar = ({ collapsed, onToggle, active, onNavigate }) => {
  const sections = [
    { label: "WORKSHOP", items: [
      { id: "compose", label: "Compose", icon: "✎" },
      { id: "history", label: "Post History", icon: "❘≡" },
      { id: "drafts", label: "Drafts", icon: "❑" },
    ]},
    { label: "INTELLIGENCE", items: [
      { id: "analyzer", label: "Algo Analyzer", icon: "⌬" },
      { id: "voice", label: "Voice Profile", icon: "❀" },
      { id: "coach", label: "AI Coach", icon: "❦" },
      { id: "inspiration", label: "Inspiration", icon: "✦" },
    ]},
    { label: "SYSTEM", items: [
      { id: "audit", label: "Audit Log", icon: "❧" },
      { id: "settings", label: "Settings", icon: "✱" },
    ]},
  ];
  return (
    <aside className={cn("sidebar", collapsed && "sidebar-collapsed")}>
      <div className="sidebar-brand">
        <span className="sidebar-mark smallcaps">CREATOROS</span>
        <span className="folio sidebar-folio">Ⅰ</span>
      </div>
      <nav className="sidebar-nav">
        {sections.map((s) => (
          <div key={s.label} className="sidebar-section">
            <div className="sidebar-section-label folio">§ {s.label}</div>
            {s.items.map((it) => (
              <button key={it.id} className={cn("sidebar-item", active === it.id && "sidebar-item-active", "smallcaps")} onClick={() => onNavigate && onNavigate(it.id)}>
                <span className="sidebar-icon mono" aria-hidden="true">{it.icon}</span>
                <span className="sidebar-label">{it.label}</span>
              </button>
            ))}
          </div>
        ))}
      </nav>
      <div className="sidebar-foot">
        <div className="sidebar-status">
          <span className="status-dot status-moss" />
          <span className="folio">@ada · connected</span>
        </div>
        <button className="icon-btn" aria-label="Settings">✱</button>
        <button className="icon-btn" aria-label="Toggle sidebar" onClick={onToggle}>{collapsed ? "›" : "‹"}</button>
      </div>
    </aside>
  );
};

// TopBar
const TopBar = ({ crumbs = [], onCmdK, onToggleTheme, theme, sync }) => (
  <header className="topbar">
    <div className="topbar-crumbs smallcaps">
      {crumbs.map((c, i) => (
        <React.Fragment key={i}>
          {i > 0 && <span className="topbar-sep folio">/</span>}
          <span>{c}</span>
        </React.Fragment>
      ))}
    </div>
    <div className="topbar-actions">
      <button className="topbar-cmd" onClick={onCmdK}>
        <span className="folio">⌘K</span>
      </button>
      <button className="icon-btn" aria-label="Toggle theme" onClick={onToggleTheme}>{theme === "light" ? "☾" : "☀"}</button>
      <span className="folio topbar-sync">
        <span className={cn("status-dot", sync.status === "ok" ? "status-moss" : sync.status === "warn" ? "status-ochre" : "status-rust")} /> synced {sync.time}
      </span>
    </div>
  </header>
);

// AppShell
const AppShell = ({ children, sidebar, topbar, inspector }) => (
  <div className={cn("app-shell", inspector && "app-shell-inspector")}>
    {sidebar}
    <div className="app-main">
      {topbar}
      <main className="app-content">{children}</main>
    </div>
    {inspector && <div className="app-inspector">{inspector}</div>}
  </div>
);

// CommandPalette
const CommandPalette = ({ open, onClose }) => {
  const [q, setQ] = useState("");
  const items = [
    { section: "Navigate", icon: "✎", label: "Compose new post", kbd: "C" },
    { section: "Navigate", icon: "❘≡", label: "Post History", kbd: "H" },
    { section: "Navigate", icon: "⌬", label: "Algo Analyzer", kbd: "A" },
    { section: "Actions", icon: "↻", label: "Regenerate voice profile", kbd: "⌘R" },
    { section: "Actions", icon: "✦", label: "Save current post to inspiration", kbd: "⌘I" },
    { section: "Recent", icon: "§ 04", label: "DRAFT-471 — \"Most 'AI safety' arguments collapse…\"", kbd: "" },
    { section: "Recent", icon: "§ 03", label: "Voice profile — 487 posts analyzed", kbd: "" },
  ];
  const filtered = items.filter((i) => i.label.toLowerCase().includes(q.toLowerCase()));
  const grouped = filtered.reduce((acc, it) => { (acc[it.section] = acc[it.section] || []).push(it); return acc; }, {});
  useEffect(() => {
    if (!open) return;
    const h = (e) => e.key === "Escape" && onClose && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="cmdk-backdrop" onClick={onClose}>
      <div className="cmdk" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <div className="cmdk-search">
          <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search commands, posts, drafts…" className="cmdk-input mono" />
          <span className="folio cmdk-hint">⌘K</span>
        </div>
        <hr className="hr-hairline" />
        <div className="cmdk-list">
          {Object.keys(grouped).length === 0 ? (
            <EmptyState title="No matches" body="Try another query." />
          ) : Object.entries(grouped).map(([section, list]) => (
            <div key={section} className="cmdk-group">
              <div className="cmdk-group-label folio">§ {section.toUpperCase()}</div>
              {list.map((it, i) => (
                <button key={i} className="cmdk-item">
                  <span className="cmdk-item-icon mono">{it.icon}</span>
                  <span className="cmdk-item-label">{it.label}</span>
                  {it.kbd && <span className="folio cmdk-item-kbd">{it.kbd}</span>}
                </button>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

// Inspector content
const Inspector = ({ children }) => (
  <aside className="inspector">{children}</aside>
);

// Theme toggle hook
const useTheme = () => {
  const [theme, setTheme] = useState(() => {
    if (typeof window === "undefined") return "dark";
    const stored = localStorage.getItem("creatoros-theme");
    if (stored) return stored;
    return window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
  });
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("creatoros-theme", theme);
  }, [theme]);
  return [theme, setTheme];
};

// ================================================================
// EXPORT TO WINDOW
// ================================================================
Object.assign(window, {
  Button, Input, Textarea, Select, Checkbox, Switch, Badge, Tooltip, Dialog, Sheet, Tabs, Toast,
  Card, RuleHeader, FolioMark, KeyValueRow, Table, Pagination, EmptyState, LoadingSkeleton, ErrorFallback,
  ScoreGauge, MetricBlock, ConfidenceLabel, PostRow, RewriteCard, VoiceProfileCard, ChatMessage, ReplyDraftCard, InspirationCard, AssumptionFlag,
  Sidebar, TopBar, AppShell, CommandPalette, Inspector,
  cn, useTheme, usePrefersReducedMotion,
});
