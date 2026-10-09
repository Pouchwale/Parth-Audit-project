// THE NOTIFICATIONS IN THE WEBSITE (REQUIREMENTS §97, engine/notificationView.ts): the bell and the Notifications page.
//
// The owner, 8-Oct-2026: the person who answers for a document "will receive a notification in mobile as well as in
// our audit software". The server keeps the ledger and words it; these tests hold how the website shows it:
//   * grouped by the day each arrived, newest first;
//   * a further page is appended once, and the next page is asked from the oldest shown;
//   * each opens its record, else its document, else the screen of its kind (the boss's summaries the dashboard);
//   * marked read in what is shown, one or all, without touching what was given;
//   * the ledger is asked for in the language chosen for the screens, and the page's own words exist in English and
//     Gujarati.
// Run: npm run test:unit -- notificationView
import test from "node:test";
import assert from "node:assert/strict";
import { appendPage, groupByDay, ledgerLanguage, localDay, markedRead, nextBefore, notificationRoute, type ViewItem } from "../src/engine/notificationView";
import { STRINGS } from "../src/i18n/strings";

const item = (id: number, createdAt: string, over: Partial<ViewItem> = {}): ViewItem => ({ id, kind: "due", createdAt, readAt: null, resolvedAt: null, data: {}, ...over });

test("grouped by the day each arrived, newest day and newest item first", () => {
  const morning = new Date(2026, 9, 9, 8, 35).toISOString();
  const noon = new Date(2026, 9, 9, 12, 5).toISOString();
  const yesterday = new Date(2026, 9, 8, 17, 50).toISOString();
  const given = [item(1, yesterday), item(3, morning), item(4, noon)];
  const groups = groupByDay(given);
  assert.deepEqual(groups.map((g) => g.day), ["2026-10-09", "2026-10-08"]);
  assert.deepEqual(groups[0].items.map((i) => i.id), [4, 3]);
  assert.deepEqual(given.map((i) => i.id), [1, 3, 4], "what was given is left as it was");
  assert.equal(localDay(noon), "2026-10-09");
});

test("a further page is appended once, and the next is asked from the oldest shown", () => {
  const shown = [item(30, "2026-10-09T05:00:00.000Z"), item(29, "2026-10-09T04:00:00.000Z")];
  const more = appendPage(shown, [item(29, "2026-10-09T04:00:00.000Z"), item(12, "2026-10-08T04:00:00.000Z")]);
  assert.deepEqual(more.map((i) => i.id), [30, 29, 12]);
  assert.equal(nextBefore(more), 12);
  assert.equal(nextBefore([]), undefined);
});

test("each opens its record, else its document, else the screen of its kind", () => {
  const routeOf = {
    record: (documentId: string | undefined, recordId: string) => `/record/${recordId}${documentId ? `?of=${documentId}` : ""}`,
    document: (documentId: string) => (documentId === "gone" ? null : `/document/${documentId}`),
  };
  assert.equal(notificationRoute({ kind: "ready", data: { documentId: "daily-pest-monitoring", recordId: "rec-1" } }, routeOf), "/record/rec-1?of=daily-pest-monitoring");
  assert.equal(notificationRoute({ kind: "due", data: { documentId: "qc-viscosity" } }, routeOf), "/document/qc-viscosity");
  assert.equal(notificationRoute({ kind: "boss_summary", data: {} }, routeOf), "/dashboard");
  assert.equal(notificationRoute({ kind: "escalation", data: {} }, routeOf), "/performance");
  assert.equal(notificationRoute({ kind: "access_changed", data: {} }, routeOf), "/library");
  assert.equal(notificationRoute({ kind: "upcoming", data: { documentId: "gone" } }, routeOf), "/notifications");
});

test("marked read in what is shown, one or all, without touching what was given", () => {
  const shown = [item(1, "2026-10-09T05:00:00.000Z"), item(2, "2026-10-09T05:00:00.000Z", { readAt: "2026-10-09T05:10:00.000Z" }), item(3, "2026-10-09T05:00:00.000Z")];
  const one = markedRead(shown, [1], "2026-10-09T06:00:00.000Z");
  assert.equal(one[0].readAt, "2026-10-09T06:00:00.000Z");
  assert.equal(one[2].readAt, null);
  assert.equal(one[1].readAt, "2026-10-09T05:10:00.000Z", "a read item keeps when it was read");
  assert.ok(markedRead(shown, "all", "x").every((i) => i.readAt !== null));
  assert.equal(shown[0].readAt, null);
});

test("the ledger is asked for in the language chosen, and the page's words exist in English and Gujarati", () => {
  assert.equal(ledgerLanguage("gu"), "gu");
  assert.equal(ledgerLanguage("en"), "en");
  const en = STRINGS.en as Record<string, string>;
  const gu = STRINGS.gu as Record<string, string>;
  const keys = Object.keys(en).filter((k) => k.startsWith("notif."));
  assert.ok(keys.length >= 20, "the notification words are in the strings file");
  for (const k of keys) {
    assert.ok(gu[k] && gu[k] !== en[k] && /[઀-૿]/.test(gu[k]), `${k} has Gujarati of its own`);
    assert.doesNotMatch(en[k], /\b(he|she|his|her|him)\b/i, `${k} names nobody by a gendered pronoun`);
  }
});
