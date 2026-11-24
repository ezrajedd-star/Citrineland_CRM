"use client";

import * as React from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button, type ButtonProps } from "@/components/ui/button";
import { EntityForm, type EntityFormProps } from "./entity-form";

export function FormDialog({
  title,
  description,
  trigger,
  triggerLabel,
  triggerVariant = "default",
  triggerSize = "sm",
  wide,
  side,
  ...formProps
}: EntityFormProps & {
  title: string;
  description?: string;
  trigger?: React.ReactNode;
  triggerLabel?: React.ReactNode;
  triggerVariant?: ButtonProps["variant"];
  triggerSize?: ButtonProps["size"];
  wide?: boolean;
  side?: "right";
}) {
  const [open, setOpen] = React.useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button variant={triggerVariant} size={triggerSize}>
            {triggerLabel ?? title}
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className={wide ? "max-w-3xl" : undefined} side={side}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        {open && (
          <EntityForm
            {...formProps}
            onSuccess={(r) => {
              setOpen(false);
              formProps.onSuccess?.(r);
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
