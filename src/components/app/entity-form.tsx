"use client";

import * as React from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { formSchemas, type FormSchemaKey } from "@/lib/validation/registry";
import type { ActionResult } from "@/lib/action";
import { Button } from "@/components/ui/button";
import { Input, Label, NativeSelect, Textarea, Checkbox } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export type FieldOption = { value: string; label: string };
export type FieldDef = {
  name: string;
  label: string;
  type?: "text" | "email" | "tel" | "number" | "money" | "percent" | "date" | "datetime" | "textarea" | "select" | "checkbox" | "multiselect" | "password" | "hidden" | "color";
  options?: FieldOption[];
  placeholder?: string;
  help?: string;
  span?: 1 | 2 | 3;
  required?: boolean;
  emptyOption?: string | false;
  autoFocus?: boolean;
};

export interface EntityFormProps {
  schema: FormSchemaKey;
  fields: FieldDef[];
  action: (values: any) => Promise<ActionResult<any>>;
  defaultValues?: Record<string, unknown>;
  submitLabel?: string;
  columns?: 1 | 2 | 3;
  onSuccess?: (result: ActionResult<any>) => void;
  successMessage?: string;
  /** Show a confirmation checkbox if the server returns a duplicate warning */
  className?: string;
  cancel?: React.ReactNode;
  destructive?: boolean;
}

export function EntityForm({
  schema,
  fields,
  action,
  defaultValues,
  submitLabel = "Save",
  columns = 2,
  onSuccess,
  successMessage = "Saved",
  className,
  cancel,
  destructive,
}: EntityFormProps) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const [formError, setFormError] = React.useState<string | null>(null);
  const [warning, setWarning] = React.useState<string | null>(null);
  const form = useForm<Record<string, any>>({
    resolver: zodResolver(formSchemas[schema] as any, undefined, { raw: true }),
    defaultValues: normalizeDefaults(fields, defaultValues),
  });
  const { register, handleSubmit, formState, control, setError, setValue } = form;

  const onSubmit = handleSubmit((values) => {
    setFormError(null);
    startTransition(async () => {
      const res = await action(values);
      if (res.ok) {
        if (res.message || successMessage) toast.success(res.message ?? successMessage);
        setWarning(null);
        onSuccess?.(res);
        if (res.redirect) router.push(res.redirect);
        else router.refresh();
      } else {
        if (res.fieldErrors) {
          for (const [k, msgs] of Object.entries(res.fieldErrors)) if (msgs?.length) setError(k, { message: msgs[0] });
        }
        if ((res as any).code === "DUPLICATE_WARNING" || res.error.startsWith("Possible duplicate")) {
          setWarning(res.error);
          setValue("confirmDuplicate", true);
        } else setFormError(res.error);
      }
    });
  });

  const grid = columns === 1 ? "sm:grid-cols-1" : columns === 3 ? "sm:grid-cols-3" : "sm:grid-cols-2";

  return (
    <form onSubmit={onSubmit} className={cn("space-y-4", className)} noValidate>
      <div className={cn("grid grid-cols-1 gap-4", grid)}>
        {fields.map((f) => {
          const err = formState.errors[f.name]?.message as string | undefined;
          const id = `f-${schema}-${f.name}`;
          if (f.type === "hidden") return <input key={f.name} type="hidden" {...register(f.name)} />;
          const span = f.span === 3 ? "sm:col-span-3" : f.span === 2 ? "sm:col-span-2" : "";
          return (
            <div key={f.name} className={cn("flex flex-col gap-1.5", span, f.type === "checkbox" && "justify-end")}>
              {f.type === "checkbox" ? (
                <label htmlFor={id} className="flex items-center gap-2 text-sm text-stone-700">
                  <Checkbox id={id} {...register(f.name)} />
                  {f.label}
                </label>
              ) : (
                <Label htmlFor={id}>
                  {f.label}
                  {f.required && <span className="text-red-600"> *</span>}
                </Label>
              )}
              {renderControl(f, id, register, control, !!err)}
              {f.help && !err && <p className="text-xs text-muted-foreground">{f.help}</p>}
              {err && <p className="text-xs text-red-600">{err}</p>}
            </div>
          );
        })}
      </div>
      {warning && (
        <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          {warning}
          <div className="mt-1 text-xs">Submit again to save anyway.</div>
        </div>
      )}
      {formError && <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">{formError}</div>}
      <div className="flex justify-end gap-2">
        {cancel}
        <Button type="submit" disabled={pending} variant={destructive ? "destructive" : "default"}>
          {pending ? "Saving…" : submitLabel}
        </Button>
      </div>
    </form>
  );
}

function normalizeDefaults(fields: FieldDef[], dv?: Record<string, unknown>) {
  const out: Record<string, unknown> = { ...(dv ?? {}) };
  for (const f of fields) {
    const v = out[f.name];
    if (f.type === "checkbox") out[f.name] = Boolean(v);
    else if (f.type === "multiselect") out[f.name] = Array.isArray(v) ? v : [];
    else if (v === null || v === undefined) out[f.name] = "";
    else if (typeof v === "number" || typeof v === "bigint") out[f.name] = String(v);
  }
  return out;
}

function renderControl(f: FieldDef, id: string, register: any, control: any, invalid: boolean) {
  const common = { id, "aria-invalid": invalid || undefined, placeholder: f.placeholder, autoFocus: f.autoFocus };
  switch (f.type) {
    case "textarea":
      return <Textarea rows={4} {...common} {...register(f.name)} />;
    case "select":
      return (
        <NativeSelect {...common} {...register(f.name)}>
          {f.emptyOption !== false && <option value="">{f.emptyOption ?? "—"}</option>}
          {f.options?.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </NativeSelect>
      );
    case "multiselect":
      return (
        <Controller
          control={control}
          name={f.name}
          render={({ field }) => (
            <div className="flex max-h-40 flex-wrap gap-2 overflow-y-auto rounded-md border bg-white p-2">
              {f.options?.map((o) => {
                const checked = (field.value as string[]).includes(o.value);
                return (
                  <label key={o.value} className={cn("flex cursor-pointer items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs", checked && "border-brand-500 bg-brand-50")}>
                    <input
                      type="checkbox"
                      className="accent-brand-600"
                      checked={checked}
                      onChange={(e) => field.onChange(e.target.checked ? [...field.value, o.value] : field.value.filter((x: string) => x !== o.value))}
                    />
                    {o.label}
                  </label>
                );
              })}
              {!f.options?.length && <span className="text-xs text-muted-foreground">No options</span>}
            </div>
          )}
        />
      );
    case "money":
      return (
        <div className="relative">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-stone-500">₱</span>
          <Input inputMode="decimal" className="pl-7 tabular" {...common} {...register(f.name)} />
        </div>
      );
    case "percent":
      return (
        <div className="relative">
          <Input inputMode="decimal" className="pr-7 tabular" {...common} {...register(f.name)} />
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-stone-500">%</span>
        </div>
      );
    case "number":
      return <Input inputMode="numeric" className="tabular" {...common} {...register(f.name)} />;
    case "date":
      return <Input type="date" {...common} {...register(f.name)} />;
    case "datetime":
      return <Input type="datetime-local" {...common} {...register(f.name)} />;
    case "color":
      return <Input type="color" className="h-9 w-20 p-1" {...common} {...register(f.name)} />;
    default:
      return <Input type={f.type ?? "text"} {...common} {...register(f.name)} />;
  }
}
