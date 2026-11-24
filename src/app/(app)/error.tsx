"use client";

import { Button } from "@/components/ui/button";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="mx-auto mt-16 max-w-md rounded-lg border bg-white p-6 text-center shadow-sm">
      <h2 className="text-lg font-semibold">Something went wrong</h2>
      <p className="mt-2 text-sm text-muted-foreground">{error.message?.includes("permission") ? error.message : "An unexpected error occurred. The team has been notified."}</p>
      {error.digest && <p className="mt-1 text-xs text-stone-400">Reference: {error.digest}</p>}
      <Button className="mt-4" onClick={reset}>
        Try again
      </Button>
    </div>
  );
}
