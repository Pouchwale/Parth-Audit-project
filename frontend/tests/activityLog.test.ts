// A LINE OF THE ACTIVITY LOG, SENT AGAIN, IS STILL ONE LINE (REQUIREMENTS §62, §75).
//
// The browser sends its lines a few at a time and sends a batch again when the
// send fails (utils/activityLog.ts). A send can "fail" after the server has
// already written it — the connection dropped just after COMMIT, the 204 never
// arrived — and the resend then used to put every line of the batch in the log
// twice. Each line now carries an id of its own, made when it is queued; the
// server writes a line whose id it already has no second time (backend/db.ts
// insertActivity, proved against PostgreSQL itself). What is proved HERE is the
// browser's half: every line gets such an id, on a plain-http page too, and a
// batch that is sent again carries the very same ids.
import test, { mock } from "node:test";
import assert from "node:assert/strict";
import { logActivity, newClientId, type ActivityEvent } from "../src/utils/activityLog";

// What the server accepts (backend/index.ts CLIENT_ID_RE), and what both ways of making one produce: a version-4 UUID.
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

test("every line's id is a random UUID", () => {
  const ids = Array.from({ length: 500 }, () => newClientId());
  assert.ok(ids.every((id) => typeof id === "string" && UUID_V4.test(id)), `not a UUID: ${ids.find((id) => !UUID_V4.test(id ?? ""))}`);
  assert.equal(new Set(ids).size, ids.length, "two lines were given one id");
});

test("on a plain-http page (no crypto.randomUUID) the id is still a UUID, made from getRandomValues", () => {
  // The plant opens the portal by address on its own network: not a secure page, so no randomUUID.
  Object.defineProperty(crypto, "randomUUID", { value: undefined, configurable: true, writable: true });
  try {
    const ids = Array.from({ length: 500 }, () => newClientId());
    assert.ok(ids.every((id) => typeof id === "string" && UUID_V4.test(id)), `not a UUID: ${ids.find((id) => !UUID_V4.test(id ?? ""))}`);
    assert.equal(new Set(ids).size, ids.length, "two lines were given one id");
  } finally {
    delete (crypto as unknown as Record<string, unknown>).randomUUID; // the prototype's own comes back
  }
  assert.equal(typeof crypto.randomUUID, "function");
});

test("a batch whose answer was lost is sent again with the SAME ids, and a new line gets a new one", async () => {
  mock.timers.enable({ apis: ["setTimeout"] });
  const sent: ActivityEvent[][] = [];
  let answer: "lost" | "ok" = "lost";
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (_url: unknown, init?: { body?: unknown }) => {
    sent.push((JSON.parse(String(init?.body)) as { events: ActivityEvent[] }).events);
    // Written by the server, but the connection dropped before its 204 came back.
    if (answer === "lost") throw new TypeError("Failed to fetch");
    return new Response(null, { status: 204 });
  }) as typeof fetch;
  const settle = () => new Promise((resolve) => setImmediate(resolve));
  try {
    logActivity("Record opened", "F/QC/01");
    logActivity("Record saved", "F/QC/01");
    logActivity("Record submitted", "F/QC/01");
    mock.timers.tick(1200);
    await settle();
    assert.equal(sent.length, 1, "the first batch was sent");
    assert.equal(sent[0].length, 3);
    assert.ok(sent[0].every((e) => typeof e.clientId === "string" && UUID_V4.test(e.clientId)), "every line was sent with its id");

    // The failed batch goes again with the next line, as it always has.
    answer = "ok";
    logActivity("Record printed", "F/QC/01");
    mock.timers.tick(1200);
    await settle();
    assert.equal(sent.length, 2, "the batch was sent again");
    assert.deepEqual(
      sent[1].slice(0, 3).map((e) => [e.action, e.clientId]),
      sent[0].map((e) => [e.action, e.clientId]),
      "the resent lines carry the ids they were first sent with — so the server writes them once"
    );
    assert.equal(sent[1][3].action, "Record printed");
    assert.ok(UUID_V4.test(sent[1][3].clientId ?? "") && !sent[0].some((e) => e.clientId === sent[1][3].clientId), "the new line has an id of its own");
  } finally {
    globalThis.fetch = realFetch;
    mock.timers.reset();
  }
});
