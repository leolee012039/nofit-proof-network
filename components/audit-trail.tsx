import type { AuditEventRow } from "@/db/schema";
import { auditLabel } from "@/lib/display";
import { personName } from "@/lib/people";
import { Disclosure, cx, formatDate } from "./ui";

/** Red only for refusals and failures; teal only for verified money or evidence; everything else neutral. */
function tone(action: string) {
  if (/verification_failed|denied|cancelled|rejected|inactive/.test(action)) return "bg-red";
  if (/payment\.captured$|proof\.executed/.test(action)) return "bg-teal";
  return "bg-steel-2";
}

const cell = "condensed text-[12px] font-semibold tracking-[0.06em] text-ink-3 uppercase";

/**
 * The append-only event log as a chain-of-custody form: every hand-off numbered,
 * signed and timed. Folded by default: it is evidence for auditors, not the page's story.
 */
export function AuditTrail({ events, title = "Chain of custody" }: { events: AuditEventRow[]; title?: string }) {
  return (
    <Disclosure title={title} meta={`${events.length} append-only entr${events.length === 1 ? "y" : "ies"}`}>
      {events.length === 0 ? (
        <p className="px-5 py-4 text-sm text-ink-3">No entries yet.</p>
      ) : (
        <div className="px-5 py-4">
          <div aria-hidden className="hidden grid-cols-[2.5rem_minmax(0,1fr)_11rem_12.5rem] gap-4 border-b border-ink pb-2 md:grid">
            <span className={cell}>No.</span>
            <span className={cell}>Entry</span>
            <span className={cell}>Signed by</span>
            <span className={cell}>When</span>
          </div>
          <ol className="divide-y divide-steel">
            {events.map((e, i) => (
              <li
                key={e.id}
                className="grid grid-cols-[2.5rem_minmax(0,1fr)] gap-x-4 gap-y-0.5 py-3 text-sm md:grid-cols-[2.5rem_minmax(0,1fr)_11rem_12.5rem]"
              >
                <span className="condensed row-span-3 flex items-start gap-1.5 pt-px text-[14px] font-extrabold text-ink tabular md:row-span-1">
                  <span aria-hidden className={cx("mt-[5px] size-2 shrink-0 rounded-[1px]", tone(e.action))} />
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span className="min-w-0">
                  <span className="block font-semibold text-ink">{auditLabel(e.action)}</span>
                  <span className="mt-0.5 block font-mono text-[12px] break-all text-ink-3">{e.action}</span>
                </span>
                <span className="text-ink-2">{personName(e.actorId)}</span>
                <span className="text-[14px] text-ink-3 tabular">{formatDate(e.createdAt)}</span>
              </li>
            ))}
          </ol>
        </div>
      )}
    </Disclosure>
  );
}
