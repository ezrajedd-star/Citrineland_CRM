import Link from "next/link";
export default function NotFound() {
  return (
    <div className="mx-auto mt-24 max-w-md text-center">
      <h2 className="text-lg font-semibold">Not found</h2>
      <p className="mt-2 text-sm text-muted-foreground">The record you're looking for doesn't exist or was deleted.</p>
      <Link href="/dashboard" className="mt-4 inline-block text-sm text-brand-700 hover:underline">
        Go to dashboard
      </Link>
    </div>
  );
}
