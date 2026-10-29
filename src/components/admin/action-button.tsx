"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, type ButtonProps } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";

type Result = { ok: boolean; error?: string; message?: string };

/**
 * Calls a (bound) server action. With `prompt`, asks for a note first and passes it as the last argument.
 */
export function ActionButton({ action, children, confirm: confirmText, prompt: promptText, promptDefault, variant = "outline", size = "sm", ...rest }: { action: (input: string) => Promise<Result>; confirm?: string; prompt?: string; promptDefault?: string } & Omit<ButtonProps, "onClick" | "action">) {
  const [pending, start] = useTransition();
  const router = useRouter();
  const toast = useToast();
  return (
    <Button
      {...rest}
      variant={variant}
      size={size}
      loading={pending}
      onClick={() => {
        let input: string | undefined;
        if (promptText) {
          const v = window.prompt(promptText, promptDefault ?? "");
          if (v === null) return;
          input = v;
        } else if (confirmText && !window.confirm(confirmText)) return;
        start(async () => {
          const r = await action(input ?? "");
          if (r.ok) toast(r.message ?? "Done", "success");
          else toast(r.error ?? "Failed", "error");
          router.refresh();
        });
      }}
    >
      {children}
    </Button>
  );
}
