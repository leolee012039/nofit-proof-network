import Link from "next/link";
import { PersonaPicker } from "@/components/client/persona-picker";
import { DEMO_PERSONAS, organizationsFixture, profilesFixture } from "@/lib/demo/fixtures";

export const metadata = { title: "Choose a demo persona" };

const PATH = [
  [
    "Buyer",
    "Describe the need in plain English (or use the sample request) and let AI draft the form. Submit it, then read the “Not a fit” verdict and the $49 proof it offers.",
  ],
  ["Seller / Admin", "Approve the $49 proof scope. Then run the proof after the buyer pays."],
  ["Buyer", "Accept the exact version and pay. Watch the result land in Outcome Memory and Decision Replay."],
];

export default function LoginPage() {
  const personas = DEMO_PERSONAS.map((p) => {
    const profile = profilesFixture.find((x) => x.userId === p.userId)!;
    const org = organizationsFixture.find((o) => o.id === profile.organizationId)!;
    return { ...p, name: profile.displayName, title: profile.title, org: org.name };
  });
  return (
    <div className="min-h-screen">
      <header className="mx-auto flex max-w-6xl items-center px-4 py-5 sm:px-6">
        <Link href="/" className="flex items-center gap-2.5 rounded-[2px]">
          <span
            aria-hidden
            className="tent condensed grid h-7 min-w-11 place-items-center bg-marker px-3 text-[14px] font-extrabold text-ink"
          >
            NF
          </span>
          <span className="leading-none">
            <span className="block text-[22px] font-extrabold tracking-[-0.02em]">NoFit</span>
            <span className="mt-0.5 block text-[12px] text-ink-3">Proof Network</span>
          </span>
        </Link>
      </header>
      <main className="mx-auto grid max-w-6xl gap-12 px-4 pt-6 pb-20 sm:px-6 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] lg:pt-12">
        <div>
          <h1 className="font-display text-[40px] leading-[1.05] font-extrabold tracking-[-0.025em] text-balance">
            Choose who you are today
          </h1>
          <p className="mt-4 max-w-[46ch] text-[16px] leading-relaxed text-ink-2">
            Everyone here is fictional and there are no passwords. Each organization sees only its own records; the database enforces that,
            not just the screen.
          </p>
          <ol className="mt-10 space-y-5">
            {PATH.map(([who, what], i) => (
              <li key={i} className="flex gap-4">
                <span className="condensed grid h-7 w-10 shrink-0 place-items-center rounded-[2px] bg-ink text-[14px] font-extrabold text-white tabular">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span className="pt-0.5 text-[16px] leading-relaxed text-ink-2">
                  <strong className="font-semibold text-ink">{who}.</strong> {what}
                </span>
              </li>
            ))}
          </ol>
        </div>
        <PersonaPicker personas={personas} />
      </main>
    </div>
  );
}
