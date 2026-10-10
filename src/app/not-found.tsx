import Link from "next/link";

export default function NotFound() {
  return (
    <div className="px-4 py-20 text-center">
      <h1 className="font-display text-3xl font-bold">Yeh page nahi mila</h1>
      <p className="mt-2 text-muted">Link ghalat ho sakta hai.</p>
      <Link href="/" className="mt-6 inline-flex min-h-[48px] items-center rounded-xl bg-berseem px-5 font-semibold text-white">Home par jayein</Link>
    </div>
  );
}
