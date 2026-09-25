import React, { useCallback, useEffect, useRef, useState } from "react";
import { FiPrinter } from "react-icons/fi";
import { ApiError, usersApi, type DirectoryPerson } from "../../api/client";
import { useAppStore } from "../../store/AppStore";
import { useAuth } from "../../store/AuthContext";
import { useRouter } from "../../store/router";
import { masterRepository } from "../../data/repositories/masterRepository";
import { departmentName } from "../../data/seed/departments";
import { departmentScope } from "../../engine/departmentScope";
import { documentOpenRoute } from "../../engine/documentRoutes";
import { currentInsightInput } from "../../engine/insightsInput";
import { startMonthlySummary, type MonthlySummary, type MonthlySummaryInput } from "../../engine/monthlySummary";
import type { Insight, InsightSeverity } from "../../engine/insights";
import type { ScoreLine } from "../../engine/performance";
import { formatDisplayDate, todayISO } from "../../utils/date";
import { printDocument } from "../../utils/print";
import { useT } from "../../i18n";
import type { DocumentDefinition } from "../../types";

// THE MONTHLY MANAGEMENT SUMMARY — Reports > Management Summary,
// /reports/{year}/{month0}/summary (REQUIREMENTS §75).
//
// A month of the plant's records in plain English for management: the
// headline first, then record-keeping, CAPA, quality, maintenance, purchase,
// pest control and what the records show read together. Every figure and every
// sentence is worked out by engine/monthlySummary.ts from the records — fixed
// templates, no model, no network — through the same engines the other screens
// use, so the summary never says a different number from the Performance
// Scorecard, the Insights page or the reports beside it.
//
// SPEED (REQUIREMENTS §56). The page paints first — the heading and "working
// out the summary" — and the summary is worked out after it in slices of about
// 8 ms with the browser free in between (engine/monthlySummary.ts
// startMonthlySummary, which takes the insights run a slice at a time as well).
// After a save anywhere (the store's version) it is worked out again two
// seconds later; a hidden tab waits until it is looked at.
//
// THE PEOPLE. The record-keeping part names the people most often late, as the
// Performance Scorecard names them, and like that page it needs the list of
// accounts from the server (GET /api/users/directory). Until it has come — or
// when it cannot be read — the summary stands without names and says so.
//
// SCOPE (REQUIREMENTS §40). An account kept to departments reads its own
// departments' records only; a part about documents it may not see is left out
// whole, and the headline says which departments the summary covers.
//
// PRINTING. The Reports page puts the company's name and the report's title
// above it on paper (its print-only header) and prints what is inside its
// data-print-doc; the buttons here are .no-print. Each part is a card of its
// own, so a long table carries onto the next page with its heading repeated.

const RECOMPUTE_AFTER_MS = 2000;

/**
 * The page's words: the translated string once i18n/strings.ts has the key,
 * the English here until then (an unknown key comes back as its last segment).
 */
function useSay() {
  const t = useT();
  return useCallback(
    (key: string, english: string): string => {
      const s = t(key);
      return s === key.split(".").pop() ? english : s;
    },
    [t]
  );
}
type Say = ReturnType<typeof useSay>;

const SEVERITY_WORD: Record<InsightSeverity, string> = { high: "High", medium: "Medium", low: "Low" };
const SEVERITY_COLOUR: Record<InsightSeverity, { fg: string; bg: string }> = {
  high: { fg: "var(--color-danger)", bg: "var(--color-danger-bg)" },
  medium: { fg: "var(--color-warning)", bg: "var(--color-warning-bg)" },
  low: { fg: "var(--color-neutral)", bg: "var(--color-neutral-bg)" },
};

/** A format number as written, or the name while the number is still to be confirmed. */
const calledBy = (doc: DocumentDefinition): string => (doc.formatNo && !doc.formatNo.toUpperCase().startsWith("TO BE") ? doc.formatNo : doc.name);
const whole = (n: number | null): string => (n === null ? "" : String(Math.round(n)));

interface Computed {
  key: string;
  people: DirectoryPerson[] | null;
  summary: MonthlySummary;
  /** Wall time from the first slice to the last, for a performance check to read (data-compute-ms). */
  ms: number;
}

// REMEMBERED BETWEEN VISITS, on the store's version (REQUIREMENTS §56): going to
// another tab and back, with nothing saved in between, shows the summary at
// once instead of working it out again. Module level, like the insights' own
// memo, and nothing is stored anywhere: it is gone with the page.
//
// FOR ONE ACCOUNT ONLY (REQUIREMENTS §75). A summary is worked out from what the
// signed-in account may see (its department scope, §40), and the server hands
// each account the list of accounts that share its departments — so what is
// remembered is marked with whose it was: the account's id and its scope. The
// next person to sign in on the same tab starts with nothing remembered, never
// with the last one's summary or their list of accounts, even when the store's
// version, the month and the mode are all the same.
interface Memory {
  account: string;
  directory: DirectoryPerson[] | null;
  summary: (Computed & { version: number; today: string }) | null;
}
let memory: Memory = { account: "", directory: null, summary: null };

/** Whose the page is: the signed-in account and the departments it is kept to (null = every department). */
export function summaryAccount(userId: string | null | undefined, scope: readonly string[] | null): string {
  return `${userId ?? ""}|${scope ? [...scope].sort().join(",") : "every"}`;
}

/** The same accounts as before — then the summary need not be worked out again for them. */
function samePeople(a: DirectoryPerson[] | null, b: DirectoryPerson[]): boolean {
  return (
    !!a &&
    a.length === b.length &&
    a.every((p, i) => p.id === b[i].id && p.name === b[i].name && p.role === b[i].role && p.departments.join("|") === b[i].departments.join("|"))
  );
}

/**
 * What this tab remembers, asked and kept for one account at a time. Reading
 * for an account that is not the one remembered finds nothing; opening the page
 * for it, or keeping anything for it, forgets the other account's first.
 * Exported for the unit tests
 * (frontend/tests/monthlySummaryMemory.test.ts).
 */
export const summaryMemory = {
  /**
   * The page has opened for this account: whatever another account left is
   * forgotten there and then — not kept until this one's list or summary
   * arrives, and not kept at all when neither ever does.
   */
  claim(account: string): void {
    mine(account);
  },
  /** The list of accounts last read for this account; null when none has been, or it was another account's. */
  directory(account: string): DirectoryPerson[] | null {
    return memory.account === account ? memory.directory : null;
  },
  /** Keeps a list just read; the list already kept when it names the same accounts, so the summary is not worked out again for nothing. */
  keepDirectory(account: string, people: DirectoryPerson[]): DirectoryPerson[] {
    const m = mine(account);
    if (!samePeople(m.directory, people)) m.directory = people;
    return m.directory as DirectoryPerson[];
  },
  /** The summary worked out for this account, month and mode, on this version of the store, today, with this list — or null. */
  summary(account: string, version: number, key: string, people: DirectoryPerson[] | null): Computed | null {
    const hit = memory.account === account ? memory.summary : null;
    return hit && hit.version === version && hit.key === key && hit.people === people && hit.today === todayISO() ? hit : null;
  },
  keepSummary(account: string, done: Computed, version: number): void {
    mine(account).summary = { ...done, version, today: todayISO() };
  },
};

/** The memory for this account, emptied first when it held another account's. */
function mine(account: string): Memory {
  if (memory.account !== account) memory = { account, directory: null, summary: null };
  return memory;
}

export function MonthlySummaryReport({ isDemo, year, month }: { isDemo: boolean; year: number; month: number }) {
  const { user } = useAuth();
  const account = summaryAccount(user?.id, departmentScope());
  // Keyed by the account: another person signing in on this tab gets a page of
  // their own, whose state starts from what is remembered for them — nothing of
  // the last person's, not even for a moment.
  return <AccountSummary key={account} account={account} isDemo={isDemo} year={year} month={month} />;
}

function AccountSummary({ account, isDemo, year, month }: { account: string; isDemo: boolean; year: number; month: number }) {
  const { version } = useAppStore();
  const { navigate } = useRouter();
  const say = useSay();
  const rootRef = useRef<HTMLDivElement>(null);
  const key = `${isDemo}|${year}|${month}`;

  // THE ACCOUNTS, read once a visit, as the Performance Scorecard reads them.
  const [people, setPeople] = useState<DirectoryPerson[] | null>(() => summaryMemory.directory(account));
  const [directoryError, setDirectoryError] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    // Another person's summary and list go the moment this account's page opens.
    summaryMemory.claim(account);
    usersApi
      .directory()
      .then((res) => {
        if (!alive) return;
        if (!Array.isArray(res?.people)) throw new ApiError("the server did not send the accounts", 0);
        setPeople(summaryMemory.keepDirectory(account, res.people));
      })
      .catch((e) => {
        if (!alive) return;
        setPeople(null);
        setDirectoryError(e instanceof ApiError ? e.message : "the server could not be reached");
      });
    return () => {
      alive = false;
    };
  }, [account]);

  const [computed, setComputed] = useState<Computed | null>(() => summaryMemory.summary(account, version, key, people));
  const lastRun = useRef<{ key: string; people: DirectoryPerson[] | null } | null>(null);

  useEffect(() => {
    const hit = summaryMemory.summary(account, version, key, people);
    if (hit) {
      lastRun.current = { key, people };
      setComputed(hit);
      return;
    }
    let cancelled = false;
    let timer = 0;
    let onVisible: (() => void) | null = null;
    const run = () => {
      if (cancelled) return;
      // A hidden tab asks for nothing (REQUIREMENTS §65.5): wait to be looked at.
      if (typeof document !== "undefined" && document.hidden) {
        onVisible = () => {
          if (document.hidden) return;
          document.removeEventListener("visibilitychange", onVisible as () => void);
          onVisible = null;
          run();
        };
        document.addEventListener("visibilitychange", onVisible);
        return;
      }
      const started = performance.now();
      // The same records, documents, day and calendar the Insights page reads
      // (engine/insightsInput.ts), with the accounts and the register's check points.
      const input: MonthlySummaryInput = { ...currentInsightInput(isDemo), people, checkpoints: masterRepository.get().checkpoints };
      const engine = startMonthlySummary(input, year, month);
      const slice = () => {
        if (cancelled) return;
        const summary = engine.step(8);
        if (!summary) {
          timer = window.setTimeout(slice, 0);
          return;
        }
        const done: Computed = { key, people, summary, ms: performance.now() - started };
        lastRun.current = { key, people };
        summaryMemory.keepSummary(account, done, version);
        setComputed(done);
      };
      slice();
    };
    // A save while the page is open: once things have settled. Another month,
    // the other mode, or the accounts just arrived: straight after this paint.
    const same = lastRun.current && lastRun.current.key === key && lastRun.current.people === people;
    timer = window.setTimeout(run, same ? RECOMPUTE_AFTER_MS : 0);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      if (onVisible) document.removeEventListener("visibilitychange", onVisible);
    };
  }, [account, key, isDemo, year, month, version, people]);

  const current = computed && computed.key === key ? computed : null;
  const s = current?.summary ?? null;
  return (
    <div
      ref={rootRef}
      data-section="monthly-summary"
      data-year={year}
      data-month0={month}
      data-ready={s ? "yes" : "no"}
      data-state={s?.state ?? ""}
      data-scope={s ? (s.everyDepartment ? "every" : s.scope) : ""}
      data-human-records={s?.humanRecords ?? ""}
      data-compute-ms={current ? Math.round(current.ms) : ""}
    >
      <div className="card card-pad mb-4 no-print">
        <div className="flex items-start justify-between gap-3 wrap">
          <div style={{ minWidth: 0 }}>
            <h3 className="text-lg">{say("rep.summary.title", "Monthly Management Summary")}</h3>
            <p className="text-sm text-muted mt-1">
              {say(
                "rep.summary.subtitle",
                "The month in plain English for management, worked out by fixed rules from the plant's own records — the same figures the Performance Scorecard, the Insights page and the other reports show. Nothing here is estimated or written by a model."
              )}
            </p>
          </div>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            data-action="print-monthly-summary"
            disabled={!s}
            onClick={(e) => printDocument(e.currentTarget.closest("[data-print-doc]") ?? rootRef.current)}
          >
            <FiPrinter size={13} /> {say("rep.summary.print", "Print")}
          </button>
        </div>
      </div>

      {!s ? (
        <div className="card empty-state" data-section="monthly-summary-loading">
          {say("rep.summary.loading", "Working out the summary…")}
        </div>
      ) : (
        <MonthlySummaryBody s={s} isDemo={isDemo} onOpen={navigate} peopleLoading={people === null && !directoryError} directoryError={directoryError} />
      )}
    </div>
  );
}

/**
 * The summary once it is worked out: the headline, then a card per part. Kept
 * apart from the page's own working-out so a check can draw a summary it has
 * worked out itself (and so the parts are drawn from the summary alone).
 */
export function MonthlySummaryBody({
  s,
  isDemo,
  onOpen,
  peopleLoading,
  directoryError,
}: {
  s: MonthlySummary;
  isDemo: boolean;
  onOpen: (route: string) => void;
  peopleLoading: boolean;
  directoryError: string | null;
}) {
  const say = useSay();
  const open = (route: string) => (e: React.MouseEvent) => {
    e.preventDefault();
    onOpen(route);
  };
  return (
    <>
      <section className="card card-pad mb-4" data-part="headline" data-sentences={s.headline.length} style={{ breakInside: "avoid", borderLeft: "4px solid var(--color-primary)" }}>
        <h3 className="text-lg mb-2">
          {say("rep.summary.headline", "At a glance")} — {s.label}
        </h3>
        {s.headline.map((line, i) => (
          <p key={i} className="mb-1" style={{ lineHeight: 1.55 }} data-sentence={i}>
            {line}
          </p>
        ))}
        <p className="text-xs text-muted mt-2" data-section="monthly-summary-basis">
          Read from {s.humanRecords} record{s.humanRecords === 1 ? "" : "s"} people wrote in {s.label}
          {isDemo ? " (Demo Mode)" : ""}, in {s.scope}. Figures that are a state — CAPA past target, calibration, supplier grades, insights — are{" "}
          {s.state === "past" ? `as they stood on ${formatDisplayDate(s.asOf)}, the month's last day` : `as they stand today, ${formatDisplayDate(s.asOf)}`}. Blank sheets
          and drafts only the assistant has filled are not read, except where a record that fell due was never handed in.
          {!s.everyDepartment && ` Parts about other departments' documents are left out: this account is kept to ${s.scope}.`}
        </p>
      </section>

      {s.records && <RecordsSection s={s} say={say} onOpen={onOpen} peopleLoading={peopleLoading} directoryError={directoryError} />}

      {s.capa && (
        <PartCard
          part="capa"
          title={say("rep.summary.capa", "CAPA")}
          sentences={s.capa.sentences}
          empty={s.capa.empty}
          data={{
            "data-raised": s.capa.internal?.raised ?? "",
            "data-closed": s.capa.internal?.closed ?? "",
            "data-open": s.capa.internal?.open ?? "",
            "data-overdue": s.capa.internal?.overdue ?? "",
            "data-complaints": s.capa.external?.received ?? "",
            "data-complaints-open": s.capa.external?.openAtEnd ?? "",
          }}
        >
          {s.capa.external && s.capa.external.complaints.length > 0 && (
            <div className="doc-table mt-3">
              <table className="compact">
                <thead>
                  <tr>
                    <th>{say("rep.summary.complaintNo", "Complaint No.")}</th>
                    <th>{say("rep.summary.customer", "Customer")}</th>
                    <th>{say("rep.summary.received", "Received")}</th>
                    <th>{say("rep.summary.status", "Status")}</th>
                  </tr>
                </thead>
                <tbody>
                  {s.capa.external.complaints.map((c) => (
                    <tr key={c.recordId}>
                      <td className="text-sm">
                        <a href={`#/gap/complaint/${c.recordId}`} onClick={open(`/gap/complaint/${c.recordId}`)}>
                          {c.complaintNo || "—"}
                        </a>
                      </td>
                      <td className="text-sm">{c.customer || "—"}</td>
                      <td className="text-sm">{formatDisplayDate(c.received)}</td>
                      <td className="text-sm">{c.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </PartCard>
      )}

      {s.quality && (
        <PartCard
          part="quality"
          title={say("rep.summary.quality", "Quality")}
          sentences={s.quality.sentences}
          empty={s.quality.empty}
          data={{
            "data-lots": s.quality.lotsInspected,
            "data-lots-not-accepted": s.quality.lotsNotAccepted,
            "data-lots-deviation": s.quality.lotsOnDeviation,
            "data-out-of-band": s.quality.outOfBandReadings,
            "data-calibration-expired": s.quality.calibrationExpired?.length ?? "",
            "data-calibration-expiring": s.quality.calibrationExpiring?.length ?? "",
          }}
        >
          {s.quality.lots.length > 0 && (
            <div className="doc-table mt-3">
              <table className="compact" data-table="summary-lots">
                <thead>
                  <tr>
                    <th>{say("rep.summary.inspectionRecord", "Inspection record")}</th>
                    <th className="score-num">{say("rep.summary.lotsCol", "Lots")}</th>
                    <th className="score-num">{say("rep.summary.accepted", "Accepted")}</th>
                    <th className="score-num">{say("rep.summary.onDeviation", "On deviation")}</th>
                    <th className="score-num">{say("rep.summary.rejected", "Rejected / scrap")}</th>
                    <th className="score-num">{say("rep.summary.segregated", "Segregated")}</th>
                  </tr>
                </thead>
                <tbody>
                  {s.quality.lots.map((l) => (
                    <tr key={l.documentId} data-document={l.documentId}>
                      <td className="text-sm notranslate" translate="no">
                        {l.formatNo}
                      </td>
                      <td className="score-num">{l.lots}</td>
                      <td className="score-num">{l.accepted}</td>
                      <td className={`score-num ${l.onDeviation ? "text-warning" : ""}`}>{l.onDeviation}</td>
                      <td className={`score-num ${l.rejected ? "text-danger font-semibold" : ""}`}>{l.rejected}</td>
                      <td className="score-num">{l.segregated}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {s.quality.outOfBand.length > 0 && (
            <div className="doc-table mt-3">
              <table className="compact" data-table="summary-out-of-band">
                <thead>
                  <tr>
                    <th>{say("rep.summary.sheet", "Sheet")}</th>
                    <th className="score-num">{say("rep.summary.readingsOut", "Readings outside the band")}</th>
                    <th className="score-num">{say("rep.summary.sheetsCol", "Sheets")}</th>
                  </tr>
                </thead>
                <tbody>
                  {s.quality.outOfBand.map((b) => (
                    <tr key={b.documentId} data-document={b.documentId}>
                      <td className="text-sm notranslate" translate="no">
                        {b.formatNo}
                      </td>
                      <td className="score-num text-danger">{b.readings}</td>
                      <td className="score-num">{b.sheets}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <InsightLines items={[...(s.quality.calibrationExpired ?? []), ...(s.quality.calibrationExpiring ?? [])]} onOpen={onOpen} say={say} />
        </PartCard>
      )}

      {s.maintenance && (
        <PartCard
          part="maintenance"
          title={say("rep.summary.maintenance", "Maintenance")}
          sentences={s.maintenance.sentences}
          empty={s.maintenance.empty}
          data={{
            "data-breakdowns": s.maintenance.breakdown?.breakdowns ?? "",
            "data-minutes": s.maintenance.breakdown?.minutes ?? "",
            "data-mttr": s.maintenance.breakdown ? whole(s.maintenance.breakdown.mttr) : "",
            "data-loss-minutes": s.maintenance.breakdown?.lossMinutes ?? "",
            "data-pm-planned": s.maintenance.pm?.planned ?? "",
            "data-pm-done": s.maintenance.pm?.done ?? "",
            "data-pm-not-done": s.maintenance.pm?.notDone ?? "",
            "data-glass": s.maintenance.glass?.breakages.length ?? "",
            "data-lux-rounds": s.maintenance.lux?.rounds ?? "",
            "data-lux-falls": s.maintenance.lux?.falls.length ?? "",
          }}
        >
          {s.maintenance.breakdown && s.maintenance.breakdown.machines.length > 0 && (
            <div className="doc-table mt-3">
              <table className="compact" data-table="summary-machines">
                <thead>
                  <tr>
                    <th>{say("rep.summary.machine", "Machine")}</th>
                    <th className="score-num">{say("rep.summary.breakdownsCol", "Breakdowns")}</th>
                    <th className="score-num">{say("rep.summary.minutesDown", "Minutes down")}</th>
                  </tr>
                </thead>
                <tbody>
                  {s.maintenance.breakdown.machines.map((m) => (
                    <tr key={m.machine} data-machine={m.machine}>
                      <td className="text-sm notranslate" translate="no">
                        {m.label}
                      </td>
                      <td className="score-num">{m.breakdowns}</td>
                      <td className="score-num">{m.minutes}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <InsightLines items={[...(s.maintenance.glass?.breakages ?? []), ...(s.maintenance.lux?.falls ?? [])]} onOpen={onOpen} say={say} />
        </PartCard>
      )}

      {s.purchase && (
        <PartCard
          part="purchase"
          title={say("rep.summary.purchase", "Purchase")}
          sentences={s.purchase.sentences}
          empty={s.purchase.empty}
          data={{ "data-a": s.purchase.a, "data-b": s.purchase.b, "data-c": s.purchase.c, "data-ungraded": s.purchase.ungraded }}
        />
      )}

      {s.pest && (
        <PartCard
          part="pest"
          title={say("rep.summary.pest", "Pest control")}
          sentences={s.pest.sentences}
          empty={s.pest.empty}
          data={{
            "data-days": s.pest.daily?.daysRecorded ?? "",
            "data-rodents": s.pest.daily?.rodents ?? "",
            "data-findings": s.pest.daily?.findings ?? "",
            "data-flies": s.pest.flies?.flies ?? "",
          }}
        />
      )}

      <PartCard
        part="insights"
        title={say("rep.summary.insights", "What the records show")}
        sentences={s.insights.sentences}
        empty={s.insights.empty}
        data={{ "data-total": s.insights.total, "data-high": s.insights.high, "data-medium": s.insights.medium, "data-low": s.insights.low, "data-listed": s.insights.top.length }}
      >
        <InsightLines items={s.insights.top} onOpen={onOpen} say={say} numbered />
      </PartCard>
    </>
  );
}

function PartCard({
  part,
  title,
  sentences,
  empty,
  data,
  children,
}: {
  part: string;
  title: string;
  sentences: string[];
  empty: boolean;
  data: Record<string, string | number>;
  children?: React.ReactNode;
}) {
  return (
    <section className="card card-pad mb-4" data-part={part} data-empty={empty ? "yes" : "no"} {...data}>
      <h3 className="text-lg mb-2">{title}</h3>
      {sentences.map((line, i) => (
        <p key={i} className={`text-sm mb-1 ${empty ? "text-muted" : ""}`} style={{ lineHeight: 1.55 }} data-sentence={i}>
          {line}
        </p>
      ))}
      {children}
    </section>
  );
}

/** Insights named in a part, each with the way to where it was read from. */
function InsightLines({ items, onOpen, say, numbered }: { items: Insight[]; onOpen: (route: string) => void; say: Say; numbered?: boolean }) {
  if (items.length === 0) return null;
  const List = numbered ? "ol" : "ul";
  return (
    <List className="mt-3 text-sm" style={{ paddingLeft: 20, lineHeight: 1.5 }} data-section="summary-insights">
      {items.map((i) => (
        <li key={i.id} className="mb-2" data-insight={i.id} data-rule={i.rule} data-severity={i.severity}>
          <span className="badge" style={{ background: SEVERITY_COLOUR[i.severity].bg, color: SEVERITY_COLOUR[i.severity].fg, marginRight: 6 }}>
            {say(`insights.${i.severity}`, SEVERITY_WORD[i.severity])}
          </span>
          <span className="text-muted">{i.module} · </span>
          {i.title}
          {i.route ? (
            <>
              {" "}
              <a
                href={`#${i.route}`}
                className="no-print"
                data-action="open-summary-insight"
                onClick={(e) => {
                  e.preventDefault();
                  onOpen(i.route as string);
                }}
              >
                {say("insights.whereToLook", "Where to look")}
              </a>
            </>
          ) : null}
        </li>
      ))}
    </List>
  );
}

const ScoreHead = ({ first, say }: { first: string; say: Say }) => (
  <thead>
    <tr>
      <th>{first}</th>
      <th className="score-num">{say("rep.summary.due", "Records due")}</th>
      <th className="score-num">{say("rep.summary.onTime", "On time")}</th>
      <th className="score-num">{say("rep.summary.late", "Late")}</th>
      <th className="score-num">{say("rep.summary.never", "Never done")}</th>
      <th className="score-num">{say("rep.summary.pending", "Not due yet")}</th>
      <th className="score-num">{say("rep.summary.score", "Score")}</th>
    </tr>
  </thead>
);

/** The same six figures and the same data-col names as the Performance Scorecard's tables. */
const ScoreCells = ({ line }: { line: ScoreLine }) => (
  <>
    <td className="score-num" data-col="due">
      {line.due}
    </td>
    <td className="score-num" data-col="onTime">
      {line.onTime}
    </td>
    <td className={`score-num ${line.late ? "text-warning" : ""}`} data-col="late">
      {line.late}
    </td>
    <td className={`score-num ${line.overdue ? "text-danger font-semibold" : ""}`} data-col="overdue">
      {line.overdue}
    </td>
    <td className="score-num text-muted" data-col="pending">
      {line.pending}
    </td>
    <td className="score-num font-bold" data-col="score">
      {line.score === null ? "—" : line.score}
    </td>
  </>
);

function RecordsSection({
  s,
  say,
  onOpen,
  peopleLoading,
  directoryError,
}: {
  s: MonthlySummary;
  say: Say;
  onOpen: (route: string) => void;
  peopleLoading: boolean;
  directoryError: string | null;
}) {
  const r = s.records;
  if (!r) return null;
  return (
    <section
      className="card card-pad mb-4"
      data-part="records"
      data-empty={r.empty ? "yes" : "no"}
      data-due={r.due}
      data-on-time={r.onTime}
      data-late={r.late}
      data-never={r.never}
      data-pending={r.pending}
      data-score={r.score ?? ""}
      data-grade={r.grade.key}
    >
      <h3 className="text-lg mb-2">{say("rep.summary.records", "Record-keeping")}</h3>
      {r.sentences.map((line, i) => (
        <p key={i} className={`text-sm mb-1 ${r.empty ? "text-muted" : ""}`} style={{ lineHeight: 1.55 }} data-sentence={i}>
          {line}
        </p>
      ))}
      {r.peopleBehind === null && (
        <p className="text-xs text-muted mb-1 no-print" data-section="summary-people-unavailable">
          {peopleLoading ? "The list of accounts is being read; the people will be named when it has come." : `The people cannot be named: the list of accounts could not be read (${directoryError ?? "unknown"}).`}
        </p>
      )}

      {r.byDepartment.length > 0 && (
        <>
          <h4 className="text-sm font-semibold mt-3 mb-1">{say("rep.summary.byDepartment", "By department")}</h4>
          <div className="doc-table">
            <table className="compact" data-table="summary-departments">
              <ScoreHead first={say("rep.summary.department", "Department")} say={say} />
              <tbody>
                {r.byDepartment.map((d) => (
                  <tr key={d.code || "none"} data-department={d.code} data-row={d.code || "none"} data-grade={d.grade.key}>
                    <td className="text-sm">{d.code ? departmentName(d.code) : d.name}</td>
                    <ScoreCells line={d} />
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {r.byModule.length > 0 && (
        <>
          <h4 className="text-sm font-semibold mt-3 mb-1">{say("rep.summary.byModule", "By module")}</h4>
          <div className="doc-table">
            <table className="compact" data-table="summary-modules">
              <ScoreHead first={say("rep.summary.module", "Module")} say={say} />
              <tbody>
                {r.byModule.map((m) => (
                  <tr key={m.module} data-module={m.module} data-row={m.module} data-grade={m.grade.key}>
                    <td className="text-sm">{m.module}</td>
                    <ScoreCells line={m} />
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {r.worstDocuments.length > 0 && (
        <>
          <h4 className="text-sm font-semibold mt-3 mb-1">{say("rep.summary.worstDocuments", "Most behind")}</h4>
          <div className="doc-table">
            <table className="compact" data-table="summary-worst-documents">
              <ScoreHead first={say("rep.summary.document", "Document")} say={say} />
              <tbody>
                {r.worstDocuments.map((d) => (
                  <tr key={d.doc.id} data-document={d.doc.id} data-grade={d.grade.key}>
                    <td className="text-sm">
                      <a
                        href={`#${documentOpenRoute(d.doc)}`}
                        className="notranslate"
                        translate="no"
                        onClick={(e) => {
                          e.preventDefault();
                          onOpen(documentOpenRoute(d.doc));
                        }}
                      >
                        {calledBy(d.doc)}
                      </a>
                    </td>
                    <ScoreCells line={d} />
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {r.peopleBehind && r.peopleBehind.length > 0 && (
        <>
          <h4 className="text-sm font-semibold mt-3 mb-1">{say("rep.summary.people", "People most often late")}</h4>
          <div className="doc-table">
            <table className="compact" data-table="summary-people">
              <ScoreHead first={say("rep.summary.person", "Person")} say={say} />
              <tbody>
                {r.peopleBehind.map((p) => (
                  <tr key={p.person.id} data-person={p.person.name} data-row={p.person.name} data-grade={p.grade.key}>
                    <td className="text-sm notranslate" translate="no">
                      {p.person.name}
                    </td>
                    <ScoreCells line={p} />
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}
