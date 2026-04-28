import type {
  ButtonHTMLAttributes,
  HTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from "react";

export function cn(...parts: unknown[]) {
  return parts.filter((part): part is string => typeof part === "string" && part.length > 0).join(" ");
}

type ButtonVariant = "primary" | "secondary" | "tertiary" | "destructive";
type ButtonSize = "sm" | "md" | "lg";

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  loading?: boolean;
  size?: ButtonSize;
  variant?: ButtonVariant;
};

export function Button({
  children,
  className,
  disabled,
  loading = false,
  size = "md",
  type = "button",
  variant = "primary",
  ...props
}: ButtonProps) {
  return (
    <button
      className={cn("btn", `btn-${variant}`, `btn-${size}`, loading && "btn-loading", className)}
      disabled={disabled || loading}
      type={type}
      aria-busy={loading || undefined}
      {...props}
    >
      <span className="btn-label">{children}</span>
      {loading ? <span aria-hidden="true" className="btn-loading-bar" /> : null}
    </button>
  );
}

export type IconButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  label: string;
  size?: "sm" | "md";
};

export function IconButton({ children, className, label, size = "md", type = "button", ...props }: IconButtonProps) {
  return (
    <button
      aria-label={label}
      className={cn("icon-btn", size === "sm" && "icon-btn-sm", className)}
      type={type}
      {...props}
    >
      {children}
    </button>
  );
}

type FieldToneProps = {
  error?: ReactNode;
  helper?: ReactNode;
  label?: ReactNode;
  mono?: boolean;
};

function fieldId(prefix: string, id?: string, name?: string, label?: ReactNode) {
  if (id) return id;
  if (name) return `${prefix}-${name}`;
  const base = typeof label === "string" ? label : prefix;
  return `${prefix}-${base.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "")}`;
}

export type InputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "size"> & FieldToneProps;

export function Input({ className, error, helper, id, label, mono = false, name, ...props }: InputProps) {
  const inputId = fieldId("input", id, name, label);

  return (
    <div className={cn("field", error && "field-error", className)}>
      {label ? (
        <label className="field-label smallcaps" htmlFor={inputId}>
          {label}
        </label>
      ) : null}
      <input className={cn("field-input", mono && "mono")} id={inputId} name={name} {...props} />
      {error || helper ? (
        <div className={cn("field-helper", error && "field-helper-error")}>{error || helper}</div>
      ) : null}
    </div>
  );
}

export type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & FieldToneProps;

export function Textarea({ className, error, helper, id, label, mono = false, name, ...props }: TextareaProps) {
  const inputId = fieldId("textarea", id, name, label);

  return (
    <div className={cn("field", error && "field-error", className)}>
      {label ? (
        <label className="field-label smallcaps" htmlFor={inputId}>
          {label}
        </label>
      ) : null}
      <textarea className={cn("field-input field-textarea", mono && "mono")} id={inputId} name={name} {...props} />
      {error || helper ? (
        <div className={cn("field-helper", error && "field-helper-error")}>{error || helper}</div>
      ) : null}
    </div>
  );
}

export type SelectOption = {
  label: ReactNode;
  value: string;
};

export type SelectProps = SelectHTMLAttributes<HTMLSelectElement> &
  FieldToneProps & {
    options: SelectOption[];
  };

export function Select({ className, error, helper, id, label, mono = false, name, options, ...props }: SelectProps) {
  const inputId = fieldId("select", id, name, label);

  return (
    <div className={cn("field", error && "field-error", className)}>
      {label ? (
        <label className="field-label smallcaps" htmlFor={inputId}>
          {label}
        </label>
      ) : null}
      <span className="select-wrap">
        <select className={cn("field-input select", mono && "mono")} id={inputId} name={name} {...props}>
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <span aria-hidden="true" className="select-chevron">
          ▾
        </span>
      </span>
      {error || helper ? (
        <div className={cn("field-helper", error && "field-helper-error")}>{error || helper}</div>
      ) : null}
    </div>
  );
}

export type SwitchProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & {
  label?: ReactNode;
};

export function Switch({ checked, className, id, label, name, ...props }: SwitchProps) {
  const inputId = fieldId("switch", id, name, label);

  return (
    <label className={cn("switch-row", className)} htmlFor={inputId}>
      <input
        checked={checked}
        className="switch-native"
        id={inputId}
        name={name}
        type="checkbox"
        {...props}
      />
      <span aria-hidden="true" className={cn("switch-track", checked && "switch-track-on")}>
        <span className="switch-thumb" />
      </span>
      {label ? <span className="switch-label">{label}</span> : null}
    </label>
  );
}

type BadgeVariant = "neutral" | "accent" | "success" | "warning" | "danger" | "outline";

export type BadgeProps = HTMLAttributes<HTMLSpanElement> & {
  variant?: BadgeVariant;
};

export function Badge({ children, className, variant = "neutral", ...props }: BadgeProps) {
  return (
    <span className={cn("badge", `badge-${variant}`, "smallcaps", className)} {...props}>
      {children}
    </span>
  );
}

export type RuleHeaderProps = HTMLAttributes<HTMLElement> & {
  actions?: ReactNode;
  folio?: ReactNode;
  label: ReactNode;
  sub?: ReactNode;
};

export function RuleHeader({ actions, className, folio, label, sub, ...props }: RuleHeaderProps) {
  return (
    <header className={cn("rule-header", className)} {...props}>
      <div className="rule-header-row">
        <div className="rule-header-left">
          {folio ? <span className="folio">{folio}</span> : null}
          <span aria-hidden="true" className="rule-header-sep">
            —
          </span>
          <span className="rule-header-label smallcaps">{label}</span>
          {sub ? <span className="rule-header-sub">{sub}</span> : null}
        </div>
        {actions ? <div className="rule-header-actions">{actions}</div> : null}
      </div>
      <hr className="hr-hairline" />
    </header>
  );
}

type CardVariant = "default" | "inset" | "elevated";

export type CardProps = HTMLAttributes<HTMLDivElement> & {
  variant?: CardVariant;
};

function CardRoot({ children, className, variant = "default", ...props }: CardProps) {
  return (
    <div className={cn("card", `card-${variant}`, className)} {...props}>
      {children}
    </div>
  );
}

function CardHeader({ children, className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("card-header", className)} {...props}>
      {children}
    </div>
  );
}

function CardBody({ children, className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("card-body", className)} {...props}>
      {children}
    </div>
  );
}

function CardFooter({ children, className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("card-footer", className)} {...props}>
      {children}
    </div>
  );
}

export const Card = Object.assign(CardRoot, {
  Body: CardBody,
  Footer: CardFooter,
  Header: CardHeader,
});

export type KeyValueRowProps = HTMLAttributes<HTMLDivElement> & {
  label: ReactNode;
  mono?: boolean;
  value?: ReactNode;
};

export function KeyValueRow({ children, className, label, mono = false, value, ...props }: KeyValueRowProps) {
  return (
    <div className={cn("kv-row", className)} {...props}>
      <div className="kv-key smallcaps">{label}</div>
      <div className={cn("kv-val", mono && "mono")}>{value ?? children}</div>
    </div>
  );
}

export type TableColumn = {
  header: ReactNode;
  key: string;
  numeric?: boolean;
};

export type TableRow = {
  id?: number | string;
  [key: string]: ReactNode;
};

export type TableProps = HTMLAttributes<HTMLDivElement> & {
  columns: TableColumn[];
  rows: TableRow[];
  selectedId?: number | string;
};

export function Table({ className, columns, rows, selectedId, "aria-label": ariaLabel, "aria-labelledby": ariaLabelledBy, ...props }: TableProps) {
  return (
    <div className={cn("table-wrap", className)} {...props}>
      <table aria-label={ariaLabel} aria-labelledby={ariaLabelledBy} className="table">
        <thead>
          <tr>
            {columns.map((column) => (
              <th className={cn(column.numeric && "num", "smallcaps")} key={column.key} scope="col">
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => {
            const rowKey = row.id ?? rowIndex;
            return (
              <tr className={cn(selectedId === row.id && "row-selected")} key={String(rowKey)}>
                {columns.map((column) => (
                  <td className={cn(column.numeric && "num")} key={column.key}>
                    {row[column.key]}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export type MetricBlockProps = HTMLAttributes<HTMLDivElement> & {
  delta?: ReactNode;
  label: ReactNode;
  tone?: "down" | "neutral" | "up";
  value: ReactNode;
};

export function MetricBlock({ className, delta, label, tone = "neutral", value, ...props }: MetricBlockProps) {
  return (
    <section className={cn("metric-block", className)} {...props}>
      <div className="metric-value mono">{value}</div>
      <div className="metric-label smallcaps">{label}</div>
      {delta ? <div className={cn("metric-delta", tone !== "neutral" && `metric-delta-${tone}`)}>{delta}</div> : null}
    </section>
  );
}

export type ScoreGaugeProps = HTMLAttributes<HTMLDivElement> & {
  label: ReactNode;
  max?: number;
  value: number;
};

export function ScoreGauge({ className, label, max = 100, value, ...props }: ScoreGaugeProps) {
  const clamped = Math.max(0, Math.min(value, max));
  const percentage = max > 0 ? (clamped / max) * 100 : 0;

  return (
    <section
      aria-label={typeof label === "string" ? label : undefined}
      aria-valuemax={max}
      aria-valuemin={0}
      aria-valuenow={clamped}
      className={cn("score-gauge", className)}
      role="meter"
      {...props}
    >
      <div className="score-value">
        {clamped}
        <span className="score-max">/{max}</span>
      </div>
      <div aria-hidden="true" className="score-track">
        <span className="score-fill" style={{ width: `${percentage}%` }} />
        <span className="score-tick score-tick-min">0</span>
        <span className="score-tick score-tick-max">{max}</span>
      </div>
      <div className="score-label smallcaps">{label}</div>
    </section>
  );
}

export type ErrorFallbackProps = HTMLAttributes<HTMLDivElement> & {
  action?: ReactNode;
  code?: ReactNode;
  message: ReactNode;
  title: ReactNode;
};

export function ErrorFallback({ action, className, code = "§", message, title, ...props }: ErrorFallbackProps) {
  return (
    <section className={cn("error-fallback", className)} role="alert" {...props}>
      <div aria-hidden="true" className="error-folio">
        {code}
      </div>
      <h2 className="error-title smallcaps">{title}</h2>
      <p className="error-body">{message}</p>
      {action ? <div>{action}</div> : null}
    </section>
  );
}

export type EmptyStateProps = Omit<HTMLAttributes<HTMLElement>, "title"> & {
  action?: ReactNode;
  glyph?: ReactNode;
  message: ReactNode;
  title: ReactNode;
};

export function EmptyState({ action, className, glyph = "❦", message, title, ...props }: EmptyStateProps) {
  return (
    <section className={cn("empty-state", className)} {...props}>
      <div aria-hidden="true" className="empty-state-glyph">
        {glyph}
      </div>
      <div className="empty-state-copy">
        <h2 className="empty-state-title smallcaps">{title}</h2>
        <p className="empty-state-message">{message}</p>
      </div>
      {action ? <div className="empty-state-action">{action}</div> : null}
    </section>
  );
}

export type AssumptionFlagProps = HTMLAttributes<HTMLDivElement> & {
  label?: ReactNode;
};

export function AssumptionFlag({ children, className, label = "Assumption", ...props }: AssumptionFlagProps) {
  return (
    <aside className={cn("assumption", className)} {...props}>
      <div className="assumption-body">
        <div className="assumption-label smallcaps">{label}</div>
        <div className="assumption-text">{children}</div>
      </div>
    </aside>
  );
}

export type RewriteCardProps = HTMLAttributes<HTMLElement> & {
  actions?: ReactNode;
  label?: ReactNode;
  rationale: ReactNode;
  text: ReactNode;
};

export function RewriteCard({ actions, className, label = "Rewrite", rationale, text, ...props }: RewriteCardProps) {
  return (
    <article className={cn("rewrite-card", className)} {...props}>
      <div className="rewrite-card-head">
        <span className="rewrite-card-label smallcaps">{label}</span>
        {actions ? <div className="rewrite-card-actions">{actions}</div> : null}
      </div>
      <p className="rewrite-card-text">{text}</p>
      <p className="rewrite-card-rationale">{rationale}</p>
    </article>
  );
}
