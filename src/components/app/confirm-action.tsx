"use client";

import * as React from "react";
import * as AD from "@radix-ui/react-alert-dialog";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button, buttonVariants, type ButtonProps } from "@/components/ui/button";
import type { ActionResult } from "@/lib/action";
import { cn } from "@/lib/utils";

/** Button that asks for confirmation, then calls a server action with fixed args. */
export function ConfirmAction({
  action,
  args,
  title,
  description,
  confirmLabel = "Confirm",
  children,
  variant = "outline",
  size = "sm",
  destructive = false,
  successMessage = "Done",
}: {
  action: (args: any) => Promise<ActionResult<any>>;
  args: unknown;
  title: string;
  description?: React.ReactNode;
  confirmLabel?: string;
  children: React.ReactNode;
  variant?: ButtonProps["variant"];
  size?: ButtonProps["size"];
  destructive?: boolean;
  successMessage?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [pending, start] = React.useTransition();
  const run = () =>
    start(async () => {
      const res = await action(args);
      if (res.ok) {
        toast.success(res.message ?? successMessage);
        setOpen(false);
        if (res.redirect) router.push(res.redirect);
        else router.refresh();
      } else toast.error(res.error);
    });
  return (
    <AD.Root open={open} onOpenChange={setOpen}>
      <AD.Trigger asChild>
        <Button variant={variant} size={size}>
          {children}
        </Button>
      </AD.Trigger>
      <AD.Portal>
        <AD.Overlay className="fixed inset-0 z-50 bg-black/40" />
        <AD.Content className="fixed left-1/2 top-1/2 z-50 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-lg border bg-white p-6 shadow-xl">
          <AD.Title className="text-lg font-semibold">{title}</AD.Title>
          {description && <AD.Description className="mt-2 text-sm text-muted-foreground">{description}</AD.Description>}
          <div className="mt-6 flex justify-end gap-2">
            <AD.Cancel className={buttonVariants({ variant: "outline" })}>Cancel</AD.Cancel>
            <button
              type="button"
              disabled={pending}
              onClick={run}
              className={cn(buttonVariants({ variant: destructive ? "destructive" : "default" }))}
            >
              {pending ? "Working…" : confirmLabel}
            </button>
          </div>
        </AD.Content>
      </AD.Portal>
    </AD.Root>
  );
}

/** Small client button that calls an action without confirmation. */
export function ActionButton({
  action,
  args,
  children,
  variant = "outline",
  size = "sm",
  successMessage = "Done",
  className,
}: {
  action: (args: any) => Promise<ActionResult<any>>;
  args: unknown;
  children: React.ReactNode;
  variant?: ButtonProps["variant"];
  size?: ButtonProps["size"];
  successMessage?: string;
  className?: string;
}) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  return (
    <Button
      variant={variant}
      size={size}
      className={className}
      disabled={pending}
      onClick={() =>
        start(async () => {
          const res = await action(args);
          if (res.ok) {
            if (successMessage) toast.success(res.message ?? successMessage);
            if (res.redirect) router.push(res.redirect);
            else router.refresh();
          } else toast.error(res.error);
        })
      }
    >
      {children}
    </Button>
  );
}
