import type { ComponentPropsWithoutRef, ReactNode } from "react";
import Link from "next/link";

import { cn } from "./index";

type LinkButtonVariant = "primary" | "secondary" | "tertiary" | "destructive";
type LinkButtonSize = "sm" | "md" | "lg";

export type LinkButtonProps = ComponentPropsWithoutRef<typeof Link> & {
  children: ReactNode;
  size?: LinkButtonSize;
  variant?: LinkButtonVariant;
};

export function LinkButton({
  children,
  className,
  size = "md",
  variant = "primary",
  ...props
}: LinkButtonProps) {
  return (
    <Link
      className={cn("btn", `btn-${variant}`, `btn-${size}`, className)}
      {...props}
    >
      <span className="btn-label">{children}</span>
    </Link>
  );
}
