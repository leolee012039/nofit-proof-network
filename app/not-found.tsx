import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-lg px-4 py-24 text-center">
      <h1 className="font-display text-[40px] leading-tight font-extrabold tracking-[-0.025em]">Not found</h1>
      <p className="mt-2 text-ink-2">This record does not exist, or it belongs to another organization (tenant isolation hides it).</p>
      <Link href="/dashboard" className="mt-6 inline-block rounded-[3px] bg-ink px-4 py-2.5 text-sm font-semibold text-white">
        Back to overview
      </Link>
    </div>
  );
}
