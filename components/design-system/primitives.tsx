"use client";

import {
  type ButtonHTMLAttributes,
  type HTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";

import { cn } from "./index";

// H-7: minimal-but-correct implementations of design-system primitives the
// component-map.md spec requires. Each primitive is intentionally plain — the
// goal is to give consumers a stable named export to migrate onto, not to ship
// a competitor to a heavyweight UI kit.
//
// Note on useEffect: this file uses the React `useEffect` hook for genuine
// external sync (focus management, dialog escape handling, mount-only
// listeners). Per the project's React architecture rules, the helper file
// `components/app-shell/use-mount-effect.ts` exists for true mount-only sync;
// we reuse the same pattern locally here for primitives that need imperative
// browser APIs (focus, keyboard, scroll lock).

// ---------- Checkbox (replaces raw <input type="checkbox">) ----------

export type CheckboxProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "size"> & {
  label?: ReactNode;
};

export function Checkbox({ checked, className, id, label, name, ...props }: CheckboxProps) {
  const generatedId = useId();
  const inputId = id ?? (name ? `checkbox-${name}` : generatedId);

  return (
    <label className={cn("checkbox-row", className)} htmlFor={inputId}>
      <input
        aria-checked={Boolean(checked)}
        checked={checked}
        className="checkbox-native"
        id={inputId}
        name={name}
        type="checkbox"
        {...props}
      />
      <span aria-hidden="true" className="checkbox-box">
        <span className="checkbox-tick" />
      </span>
      {label ? <span className="checkbox-label">{label}</span> : null}
    </label>
  );
}

// ---------- ConfidenceLabel ----------

export type ConfidenceKind = "fact" | "inference" | "mixed" | "speculation";

export function ConfidenceLabel({
  className,
  kind,
  ...props
}: HTMLAttributes<HTMLSpanElement> & { kind: ConfidenceKind }) {
  const variantClass = `confidence-${kind}`;
  const visibleLabel: Record<ConfidenceKind, string> = {
    fact: "fact",
    inference: "inference",
    mixed: "mixed",
    speculation: "speculation",
  };

  return (
    <span aria-label={`Confidence: ${visibleLabel[kind]}`} className={cn("confidence-label", variantClass, className)} {...props}>
      <span aria-hidden="true" className="confidence-dot" />
      <span className="confidence-text">{visibleLabel[kind]}</span>
    </span>
  );
}

// ---------- LoadingSkeleton ----------

export type LoadingSkeletonProps = HTMLAttributes<HTMLDivElement> & {
  ariaLabel?: string;
  lines?: number;
};

export function LoadingSkeleton({ ariaLabel = "Loading", className, lines = 3, ...props }: LoadingSkeletonProps) {
  return (
    <div aria-busy="true" aria-label={ariaLabel} className={cn("loading-skeleton", className)} role="status" {...props}>
      {Array.from({ length: Math.max(1, lines) }).map((_, index) => (
        <span aria-hidden="true" className="loading-skeleton-bar" key={index} />
      ))}
      <span className="visually-hidden">{ariaLabel}</span>
    </div>
  );
}

// ---------- Pagination ----------

export type PaginationProps = HTMLAttributes<HTMLElement> & {
  onPageChange?: (page: number) => void;
  page: number;
  pageCount: number;
};

export function Pagination({ className, onPageChange, page, pageCount, ...props }: PaginationProps) {
  const safeCount = Math.max(1, pageCount);
  const safePage = Math.min(Math.max(1, page), safeCount);

  return (
    <nav aria-label="Pagination" className={cn("pagination", className)} {...props}>
      <button
        aria-label="Previous page"
        className="pagination-step"
        disabled={safePage <= 1}
        onClick={() => onPageChange?.(safePage - 1)}
        type="button"
      >
        ‹
      </button>
      <span aria-current="page" className="pagination-current mono">
        {safePage}
      </span>
      <span aria-hidden="true" className="pagination-divider">
        /
      </span>
      <span className="pagination-total mono">{safeCount}</span>
      <button
        aria-label="Next page"
        className="pagination-step"
        disabled={safePage >= safeCount}
        onClick={() => onPageChange?.(safePage + 1)}
        type="button"
      >
        ›
      </button>
    </nav>
  );
}

// ---------- Tabs (a11y-correct, uncontrolled) ----------

export type TabItem = {
  content: ReactNode;
  id: string;
  label: ReactNode;
};

export type TabsProps = HTMLAttributes<HTMLDivElement> & {
  defaultActiveId?: string;
  items: TabItem[];
  onTabChange?: (id: string) => void;
};

export function Tabs({ className, defaultActiveId, items, onTabChange, ...props }: TabsProps) {
  const initial = defaultActiveId ?? items[0]?.id ?? "";
  const [active, setActive] = useState(initial);

  const handleSelect = (id: string) => {
    setActive(id);
    onTabChange?.(id);
  };

  return (
    <div className={cn("tabs", className)} {...props}>
      <div aria-orientation="horizontal" className="tabs-list" role="tablist">
        {items.map((item) => (
          <button
            aria-controls={`tab-panel-${item.id}`}
            aria-selected={active === item.id}
            className={cn("tabs-tab", active === item.id && "tabs-tab-active")}
            id={`tab-${item.id}`}
            key={item.id}
            onClick={() => handleSelect(item.id)}
            role="tab"
            type="button"
          >
            {item.label}
          </button>
        ))}
      </div>
      {items.map((item) => (
        <div
          aria-labelledby={`tab-${item.id}`}
          className="tabs-panel"
          hidden={active !== item.id}
          id={`tab-panel-${item.id}`}
          key={item.id}
          role="tabpanel"
        >
          {item.content}
        </div>
      ))}
    </div>
  );
}

// ---------- Tooltip ----------

export type TooltipProps = HTMLAttributes<HTMLSpanElement> & {
  content: ReactNode;
};

export function Tooltip({ children, className, content, ...props }: TooltipProps) {
  return (
    <span className={cn("tooltip-host", className)} {...props}>
      {children}
      <span className="tooltip-bubble" role="tooltip">
        {content}
      </span>
    </span>
  );
}

// ---------- Dialog ----------

export type DialogProps = {
  ariaDescribedBy?: string;
  ariaLabel?: string;
  ariaLabelledBy?: string;
  children: ReactNode;
  initialFocusRef?: React.RefObject<HTMLElement | null>;
  onClose: () => void;
  open: boolean;
};

export function Dialog({ ariaDescribedBy, ariaLabel, ariaLabelledBy, children, initialFocusRef, onClose, open }: DialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const target = initialFocusRef?.current ?? dialogRef.current;
    target?.focus({ preventScroll: true });

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      previouslyFocused?.focus({ preventScroll: true });
    };
  }, [open, onClose, initialFocusRef]);

  if (!open) return null;

  return (
    <div className="dialog-backdrop" onClick={onClose} role="presentation">
      <div
        aria-describedby={ariaDescribedBy}
        aria-label={ariaLabel}
        aria-labelledby={ariaLabelledBy}
        aria-modal="true"
        className="dialog"
        onClick={(event) => event.stopPropagation()}
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
      >
        {children}
      </div>
    </div>
  );
}

// ---------- Sheet (side drawer) ----------

export type SheetProps = DialogProps & {
  side?: "left" | "right";
};

export function Sheet({ children, side = "right", ...dialogProps }: SheetProps) {
  if (!dialogProps.open) return null;

  return (
    <div className="sheet-backdrop" onClick={dialogProps.onClose} role="presentation">
      <aside
        aria-label={dialogProps.ariaLabel}
        aria-labelledby={dialogProps.ariaLabelledBy}
        className={cn("sheet", side === "left" ? "sheet-left" : "sheet-right")}
        onClick={(event) => event.stopPropagation()}
        role="dialog"
      >
        {children}
      </aside>
    </div>
  );
}

// ---------- Toast / Toaster ----------

export type ToastVariant = "info" | "success" | "warning" | "error";

export type Toast = {
  id: string;
  message: ReactNode;
  variant?: ToastVariant;
};

export type ToasterProps = HTMLAttributes<HTMLOutputElement> & {
  toasts: Toast[];
};

export function Toaster({ className, toasts, ...props }: ToasterProps) {
  return (
    <output aria-live="polite" aria-atomic="true" className={cn("toaster", className)} {...props}>
      {toasts.map((toast) => (
        <div className={cn("toast", `toast-${toast.variant ?? "info"}`)} key={toast.id} role="status">
          {toast.message}
        </div>
      ))}
    </output>
  );
}

// Small dismiss button used inside toasts when needed.
export function ToastDismissButton({ className, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button aria-label="Dismiss" className={cn("toast-dismiss", className)} type="button" {...props}>
      ✕
    </button>
  );
}
