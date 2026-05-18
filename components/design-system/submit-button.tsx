"use client";

import { useFormStatus } from "react-dom";

import { Button, type ButtonProps } from "./index";

export type SubmitButtonProps = Omit<ButtonProps, "type" | "loading">;

export function SubmitButton({ children, disabled, ...props }: SubmitButtonProps) {
  const { pending } = useFormStatus();

  return (
    <Button {...props} disabled={disabled || pending} loading={pending} type="submit">
      {children}
    </Button>
  );
}
