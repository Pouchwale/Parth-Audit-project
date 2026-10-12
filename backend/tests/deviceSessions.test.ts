// WHO IS SIGNED IN WHERE, AND ON HOW MANY DEVICES (REQUIREMENTS §106, backend/deviceSessions.ts):
//   * at most DCRS_MAX_DEVICES devices an account (2 unless set; "off" or 0: none), a device that signs in again
//     replaces its own session, never a second place, and one device more is refused in plain words naming the devices
//     and since when, and what to do; the super admin is never held to it, but his devices are listed;
//   * a sign-out ends the session, so its token is no use any more; the super admin's "Sign out this device" ends one,
//     and that device's next request is told so, in English, Hindi or Gujarati; the day's end still ends a session;
//   * a token made before sessions were kept is taken in once, its device "signed in before devices were recorded",
//     so the release signs nobody out;
//   * the device in words from the browser's own (Windows computer - Chrome, Android phone - Chrome, iPhone - Safari,
//     iPad - Safari) and the phone's from the Mitra server, believed only beside X-Mitra-Key matching
//     MITRA_SERVER_KEY, compared in constant time and never written in a log or an answer.
// The rules run here over the store kept in memory; when DCRS_SESSIONS_TEST_URL names a THROWAWAY PostgreSQL database
// (its tables are made in it), the same checks run on PostgreSQL's store too. The routes are proved in
// backend/tests/accessRoutes.test.ts (the super admin's view and "Sign out this device") and apiV1.test.ts (a phone's
// session ended in DCRS), and in the browser by tests/e2e_user_access.py.
// Run: npm run test:unit -- deviceSessions
//      DCRS_SESSIONS_TEST_URL=postgres://user:password@127.0.0.1:55433/a_throwaway_database npm run test:unit -- deviceSessions
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { after, before, describe, it, mock } from "node:test";
import {
  DEFAULT_MAX_DEVICES,
  TOUCH_EVERY_MS,
  createDeviceSessions,
  decideSignIn,
  describePhone,
  describeUserAgent,
  deviceLine,
  maxDevicesOf,
  memorySessionStore,
  mitraKeyMatches,
  mitraServerKey,
  postgresSessionStore,
  sessionJson,
  type DeviceFacts,
  type DeviceRequest,
  type SessionRecord,
  type SessionsEnded,
  type SessionStore,
} from "../deviceSessions.ts";
import { BEFORE_DEVICES_NAME, DEVICE_LIMIT_CODE, MITRA_UNNAMED_NAME, SESSION_ENDED_CODE, deviceLimitWordsOf, deviceNameIn, sessionEndedWordsOf } from "../../frontend/src/engine/deviceWords.ts";

const ZONE = "Asia/Kolkata";
/** 14:05 at the factory on Friday 9 October 2026. */
const NOW = Date.parse("2026-10-09T08:35:00.000Z");
/** The close of that day's staff hours, 18:20 at the factory. */
const CLOSE = new Date("2026-10-09T12:50:00.000Z");
const KEY = "a-long-mitra-server-key-0123456789";

const UA = {
  windowsChrome: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36",
  androidPhone: "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36",
  androidTablet: "Mozilla/5.0 (Linux; Android 14; SM-X710) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36",
  iphone: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1",
  ipad: "Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
  macSafari: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15",
  edge: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36 Edg/141.0.0.0",
  node: "node",
};

/** A request as backend/index.ts hands it to the module: headers by name, the caller's address, the sign-in's body. */
function request(headers: Record<string, string>, ip = "::ffff:10.192.193.40", body: unknown = undefined): DeviceRequest {
  const lower = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]));
  return { header: (name) => lower[name.toLowerCase()], ip, body };
}

const browser = (ua: string, id: string, ip?: string) => request({ "user-agent": ua }, ip, { device: { id, touchPoints: 0 } });

const STAFF = { id: "u-kapila", role: "staff" };
const ADMIN = { id: "u-admin", role: "admin" };

let sid = 0;
const newId = (): string => `s-${(++sid).toString().padStart(4, "0")}-${crypto.randomBytes(4).toString("hex")}`;

// ---------------------------------------------------------------------------

describe("the limit, DCRS_MAX_DEVICES", () => {
  it("is 2 unless set; a whole number from 1 to 50; off, 0, no or false for no limit; anything else keeps the 2", () => {
    assert.equal(DEFAULT_MAX_DEVICES, 2);
    assert.equal(maxDevicesOf({}), 2);
    assert.equal(maxDevicesOf({ DCRS_MAX_DEVICES: "3" }), 3);
    assert.equal(maxDevicesOf({ DCRS_MAX_DEVICES: " 1 " }), 1);
    assert.equal(maxDevicesOf({ DCRS_MAX_DEVICES: "500" }), 50);
    for (const off of ["off", "OFF", "0", "no", "false"]) assert.equal(maxDevicesOf({ DCRS_MAX_DEVICES: off }), null, off);
    for (const odd of ["two", "-1", "1.5", "2x"]) assert.equal(maxDevicesOf({ DCRS_MAX_DEVICES: odd }), 2, odd);
  });

  it("counts a device once, however many of its sessions are open, and never the one being replaced", () => {
    const at = new Date(NOW);
    const row = (id: string, device: string): SessionRecord => ({
      id,
      userId: STAFF.id,
      device: { id: device, name: device, category: "computer", place: "website", client: "", system: "", address: "" },
      signedInAt: at,
      lastUsedAt: at,
      endsAt: CLOSE,
      endedAt: null,
      endedWhy: null,
      endedBy: null,
    });
    const open = [row("a1", "dev-a-000001"), row("a2", "dev-a-000001"), row("b1", "dev-b-000001")];
    assert.deepEqual(decideSignIn(open, { id: "dev-c-000001" }, { limit: 3, exempt: false, replace: [] }), { ok: true, replace: [] });
    const refused = decideSignIn(open, { id: "dev-c-000001" }, { limit: 2, exempt: false, replace: [] });
    assert.equal(refused.ok, false);
    assert.deepEqual(!refused.ok && refused.holding.map((s) => s.id), ["a1", "b1"], "device a holds one place, not two");
    assert.deepEqual(decideSignIn(open, { id: "dev-a-000001" }, { limit: 2, exempt: false, replace: [] }), { ok: true, replace: ["a1", "a2"] });
    assert.deepEqual(decideSignIn(open, { id: "" }, { limit: 2, exempt: false, replace: ["b1"] }), { ok: true, replace: ["b1"] });
    assert.deepEqual(decideSignIn(open, { id: "dev-c-000001" }, { limit: 2, exempt: true, replace: [] }), { ok: true, replace: [] });
  });
});

describe("the device in words", () => {
  it("names a browser by its system and its kind, from its own user agent", () => {
    assert.deepEqual(describeUserAgent(UA.windowsChrome), { name: "Windows computer - Chrome", category: "computer", client: "Chrome 141", system: "Windows", browser: true });
    assert.deepEqual(describeUserAgent(UA.androidPhone), { name: "Android phone - Chrome", category: "mobile", client: "Chrome 141", system: "Android 14", browser: true });
    assert.equal(describeUserAgent(UA.androidTablet).name, "Android tablet - Chrome");
    assert.equal(describeUserAgent(UA.androidTablet).category, "tablet");
    assert.deepEqual(describeUserAgent(UA.iphone), { name: "iPhone - Safari", category: "mobile", client: "Safari 18", system: "iOS 18.1", browser: true });
    assert.deepEqual(describeUserAgent(UA.ipad), { name: "iPad - Safari", category: "tablet", client: "Safari 17", system: "iPadOS 17.5", browser: true });
    assert.equal(describeUserAgent(UA.macSafari).name, "Mac computer - Safari");
    assert.equal(describeUserAgent(UA.edge).name, "Windows computer - Edge");
  });

  it("tells an iPad asking for the desktop site by its touch screen, and a phone by its client hints", () => {
    const ipad = describeUserAgent(UA.macSafari, {}, 5);
    assert.equal(ipad.name, "iPad - Safari");
    assert.equal(ipad.category, "tablet");
    const hinted = describeUserAgent("Mozilla/5.0 (Linux; Android 14; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36", { mobile: "?1", platform: '"Android"' });
    assert.equal(hinted.category, "mobile");
    assert.equal(hinted.name, "Android phone - Chrome");
  });

  it("says a program is not a browser", () => {
    assert.equal(describeUserAgent(UA.node).browser, false);
    assert.equal(describeUserAgent("").browser, false);
  });

  it("reads the phone from the Mitra server's headers, percent-encoded so a Gujarati name travels as ASCII", () => {
    const phone = describePhone(
      request({
        "x-mitra-device-id": "3f1c2d4e-5b6a-4c7d-8e9f-0a1b2c3d4e5f",
        "x-mitra-device-name": encodeURIComponent("કપિલાનો ફોન"),
        "x-mitra-device-model": "Pixel 8",
        "x-mitra-device-system": "Android 14",
        "x-mitra-device-type": "phone",
        "x-mitra-app-version": "1.1.0",
        "x-mitra-device-address": "10.192.193.77",
      })
    );
    assert.deepEqual(phone, {
      id: "3f1c2d4e-5b6a-4c7d-8e9f-0a1b2c3d4e5f",
      name: "કપિલાનો ફોન (Pixel 8)",
      category: "mobile",
      client: "Mitra app 1.1.0",
      system: "Android 14",
      address: "10.192.193.77",
    });
    assert.equal(describePhone(request({ "x-mitra-device-model": "iPad Air", "x-mitra-device-system": "iPadOS 18" })).category, "tablet");
    assert.equal(describePhone(request({ "x-mitra-device-model": "Web browser", "x-mitra-device-system": "Windows" })).category, "computer");
    assert.equal(describePhone(request({ "x-mitra-device-address": "not an address; DROP" })).address, "", "an address that is not one is dropped");
  });
});

// ---------------------------------------------------------------------------
// the rules, over a store

interface Harness {
  store: SessionStore;
  /** Makes the accounts the sessions belong to (PostgreSQL's rows refer to them). */
  accounts(ids: string[]): Promise<void>;
  close(): Promise<void>;
}

function contract(name: string, make: () => Promise<Harness>): void {
  describe(name, { timeout: 120_000 }, () => {
    let h: Harness;
    let now = NOW;
    const clock = () => new Date(now);
    const sessions = (limit: number | null = 2, mitraKey = "") => createDeviceSessions({ store: h.store, clock, limit, mitraKey, timeZone: () => ZONE });
    let staff = STAFF;
    let admin = ADMIN;

    before(async () => {
      h = await make();
      // Accounts of their own for this run, so a database used before holds nothing of theirs.
      const run = crypto.randomBytes(3).toString("hex");
      staff = { id: `u-kapila-${run}`, role: "staff" };
      admin = { id: `u-admin-${run}`, role: "admin" };
      await h.accounts([staff.id, admin.id, `u-other-${run}`]);
    });
    after(async () => {
      await h?.close();
    });

    async function signIn(s: ReturnType<typeof sessions>, user: { id: string; role: string }, req: DeviceRequest, extra: { replace?: string[] } = {}) {
      const sessionId = newId();
      const device = s.deviceOf(req);
      const result = await s.signIn({ sessionId, user, device, endsAt: CLOSE, replace: extra.replace });
      return { sessionId, device, result };
    }
    const claim = (sessionId: string, userId: string, req: DeviceRequest = request({})) => ({ sessionId, userId, issuedAt: null, endsAt: CLOSE, request: req });

    it("lets an account sign in on two devices, and refuses a third in plain words naming them, since when, and what to do", async () => {
      now = NOW;
      const s = sessions(2);
      now = Date.parse("2026-10-09T03:32:00.000Z"); // 09:02 at the factory
      const first = await signIn(s, staff, browser(UA.windowsChrome, "browser-pc-000001"));
      now = Date.parse("2026-10-09T04:45:00.000Z"); // 10:15
      const second = await signIn(s, staff, browser(UA.androidPhone, "browser-phone-0001"));
      assert.equal(first.result.ok, true);
      assert.equal(second.result.ok, true);
      now = NOW;
      const third = await signIn(s, staff, browser(UA.iphone, "browser-iphone-001"));
      assert.equal(third.result.ok, false);
      const holding = third.result.ok ? [] : third.result.holding;
      assert.deepEqual(holding.map((x) => x.id), [first.sessionId, second.sessionId]);
      const body = s.limitRefusal(holding, "en");
      assert.equal(body.code, DEVICE_LIMIT_CODE);
      assert.equal(body.limit, 2);
      assert.equal(
        body.error,
        "This account is already signed in on 2 devices: Windows computer - Chrome (Website, since 09:02) and Android phone - Chrome (Website, since 10:15). Sign out on one of them, or ask the super admin to sign one out."
      );
      assert.deepEqual(
        body.devices.map((d) => [d.name, d.category, d.place, d.sinceText]),
        [
          ["Windows computer - Chrome", "computer", "website", "09:02"],
          ["Android phone - Chrome", "mobile", "website", "10:15"],
        ]
      );
      assert.match(s.limitRefusal(holding, "gu").error, /^આ ખાતું પહેલેથી 2 ઉપકરણો પર સાઇન ઇન છે: Windows computer - Chrome \(વેબસાઇટ, 09:02 થી\) અને /);
      assert.match(s.limitRefusal(holding, "hi").error, /^यह खाता पहले से 2 डिवाइस पर साइन इन है: .*सुपर एडमिन से एक को साइन आउट करने को कहें।$/);
      // The website says it in its screens' language from the same answer (engine/deviceWords.ts).
      assert.equal(deviceLimitWordsOf("en", body), body.error);
      assert.equal(deviceLimitWordsOf("gu", body), s.limitRefusal(holding, "gu").error);
      // Nothing was started for the refused device.
      assert.equal((await s.open()).filter((x) => x.userId === staff.id).length, 2);
      for (const id of [first.sessionId, second.sessionId]) await s.end(id, "signed-out", staff.id);
    });

    it("lets a device that signs in again take its own place: the older session ends as replaced, never a double count", async () => {
      now = NOW;
      const s = sessions(2);
      const pc = await signIn(s, staff, browser(UA.windowsChrome, "browser-pc-000002"));
      const phone = await signIn(s, staff, browser(UA.androidPhone, "browser-phone-0002"));
      const again = await signIn(s, staff, browser(UA.windowsChrome, "browser-pc-000002"));
      assert.deepEqual(again.result, { ok: true, replaced: 1 });
      const mine = (await s.open()).filter((x) => x.userId === staff.id).map((x) => x.id);
      assert.deepEqual(mine.sort(), [phone.sessionId, again.sessionId].sort());
      const old = await s.check(claim(pc.sessionId, staff.id));
      assert.equal(old.ok, false);
      const told = s.endedRefusal(old.session, "en");
      assert.equal(told?.code, SESSION_ENDED_CODE);
      assert.equal(told?.why, "replaced");
      assert.equal(told?.error, "This device signed in again at 14:05, so this older sign-in was ended. Sign in again.");
      // A browser with no id of its own (an older page) is replaced through the session it still carries (its cookie).
      const carried = await signIn(s, staff, request({ "user-agent": UA.androidPhone }), { replace: [phone.sessionId] });
      assert.deepEqual(carried.result, { ok: true, replaced: 1 });
      for (const x of await s.open()) if (x.userId === staff.id) await s.end(x.id, "signed-out", staff.id);
    });

    it("never holds the super admin to the limit, and lists every device he is signed in on", async () => {
      now = NOW;
      const s = sessions(2);
      const ids: string[] = [];
      for (const [ua, id] of [
        [UA.windowsChrome, "admin-pc-00000001"],
        [UA.androidPhone, "admin-phone-000001"],
        [UA.ipad, "admin-ipad-0000001"],
      ] as const) {
        const signed = await signIn(s, admin, browser(ua, id));
        assert.equal(signed.result.ok, true, id);
        ids.push(signed.sessionId);
      }
      const his = (await s.open()).filter((x) => x.userId === admin.id);
      assert.deepEqual(his.map((x) => x.id), ids);
      assert.deepEqual(his.map((x) => sessionJson(x).category), ["computer", "mobile", "tablet"]);
      for (const id of ids) await s.end(id, "signed-out", admin.id);
    });

    it("ends a session at its sign-out: the token is no use any more, a second sign-out writes nothing", async () => {
      now = NOW;
      const s = sessions(2);
      const pc = await signIn(s, staff, browser(UA.windowsChrome, "browser-pc-000003"));
      assert.equal((await s.check(claim(pc.sessionId, staff.id))).ok, true);
      assert.equal(await s.signOut(claim(pc.sessionId, staff.id)), "ended");
      const after = await s.check(claim(pc.sessionId, staff.id));
      assert.equal(after.ok, false);
      assert.equal(s.endedRefusal(after.session, "en")?.error, "This sign-in was signed out at 14:05. Sign in again.");
      assert.equal(await s.signOut(claim(pc.sessionId, staff.id)), "already");
      // Its place is free: two more devices sign in.
      const a = await signIn(s, staff, browser(UA.androidPhone, "browser-phone-0003"));
      const b = await signIn(s, staff, browser(UA.iphone, "browser-iphone-003"));
      assert.equal(a.result.ok && b.result.ok, true);
      for (const id of [a.sessionId, b.sessionId]) await s.end(id, "signed-out", staff.id);
    });

    it("lets the super admin sign a device out: its next request is told so, in English, Hindi and Gujarati", async () => {
      now = NOW;
      const s = sessions(2);
      const phone = await signIn(s, staff, browser(UA.androidPhone, "browser-phone-0004"));
      const ended = await s.end(phone.sessionId, "super-admin", admin.id);
      assert.equal(ended?.endedWhy, "super-admin");
      assert.equal(ended?.endedBy, admin.id);
      assert.equal(await s.end(phone.sessionId, "super-admin", admin.id), null, "an ended session is not ended twice");
      const next = await s.check(claim(phone.sessionId, staff.id));
      assert.equal(next.ok, false);
      const en = s.endedRefusal(next.session, "en");
      assert.deepEqual({ code: en?.code, why: en?.why, at: en?.endedAtText }, { code: SESSION_ENDED_CODE, why: "super-admin", at: "14:05" });
      assert.equal(en?.error, "The super admin signed this device out at 14:05. Sign in again to carry on.");
      assert.equal(s.endedRefusal(next.session, "hi")?.error, "सुपर एडमिन ने 14:05 बजे इस डिवाइस को साइन आउट किया। जारी रखने के लिए फिर से साइन इन करें।");
      assert.equal(s.endedRefusal(next.session, "gu")?.error, "સુપર એડમિને 14:05 વાગ્યે આ ઉપકરણને સાઇન આઉટ કર્યું. ચાલુ રાખવા ફરી સાઇન ઇન કરો.");
      // The website rebuilds the words in its screens' language from the answer.
      assert.equal(sessionEndedWordsOf("gu", en), s.endedRefusal(next.session, "gu")?.error);
      assert.equal((await s.open()).some((x) => x.id === phone.sessionId), false, "off the super admin's list");
    });

    it("ends every device of an account switched off, and nobody else's", async () => {
      now = NOW;
      const s = sessions(null);
      const a = await signIn(s, staff, browser(UA.windowsChrome, "browser-pc-000005"));
      const b = await signIn(s, staff, browser(UA.androidPhone, "browser-phone-0005"));
      const his = await signIn(s, admin, browser(UA.windowsChrome, "admin-pc-00000005"));
      assert.equal(await s.endAll(staff.id, "account-off", admin.id), 2);
      for (const id of [a.sessionId, b.sessionId]) assert.equal((await s.check(claim(id, staff.id))).ok, false);
      assert.equal((await s.check(claim(his.sessionId, admin.id))).ok, true);
      await s.end(his.sessionId, "signed-out", admin.id);
    });

    it("still ends a session with its day: past its end it is refused as plain, off the list, and holds no place", async () => {
      now = NOW;
      const s = sessions(2);
      const a = await signIn(s, staff, browser(UA.windowsChrome, "browser-pc-000006"));
      const b = await signIn(s, staff, browser(UA.androidPhone, "browser-phone-0006"));
      now = CLOSE.getTime() + 60_000;
      const late = await s.check(claim(a.sessionId, staff.id));
      assert.equal(late.ok, false);
      assert.equal(s.endedRefusal(late.session, "en"), null, "a session that ran to its end is the plain 401");
      assert.equal((await s.open()).some((x) => x.userId === staff.id), false);
      const tomorrow = await signIn(s, staff, browser(UA.iphone, "browser-iphone-006"));
      assert.equal(tomorrow.result.ok, true, "yesterday's two devices hold no place today");
      now = NOW;
      for (const id of [a.sessionId, b.sessionId, tomorrow.sessionId]) await s.end(id, "signed-out", staff.id);
    });

    it("takes in a token made before sessions were kept, once, as signed in before devices were recorded", async () => {
      now = NOW;
      const s = sessions(2);
      const before = `pre-${crypto.randomBytes(16).toString("hex")}`;
      const issuedAt = new Date("2026-10-09T03:15:00.000Z");
      const first = await s.check({ sessionId: before, userId: staff.id, issuedAt, endsAt: CLOSE, request: request({ "user-agent": UA.windowsChrome }) });
      assert.equal(first.ok, true);
      assert.equal(first.ok && first.adopted, true);
      assert.equal(first.session.device.name, BEFORE_DEVICES_NAME);
      assert.equal(first.session.device.category, "computer");
      assert.equal(first.session.signedInAt.toISOString(), issuedAt.toISOString());
      const second = await s.check({ sessionId: before, userId: staff.id, issuedAt, endsAt: CLOSE, request: request({ "user-agent": UA.windowsChrome }) });
      assert.equal(second.ok && second.adopted, false, "taken in once");
      assert.equal(sessionJson(second.session).before, true);
      // It is a session like any other from then on: it can be signed out.
      assert.equal(await s.signOut({ sessionId: before, userId: staff.id, issuedAt, endsAt: CLOSE, request: request({}) }), "ended");
      assert.equal((await s.check({ sessionId: before, userId: staff.id, issuedAt, endsAt: CLOSE, request: request({}) })).ok, false);
    });

    it("writes 'last used' at most once a minute per session", async () => {
      now = NOW;
      const s = sessions(2);
      const pc = await signIn(s, staff, browser(UA.windowsChrome, "browser-pc-000007"));
      now = NOW + 30_000;
      await s.check(claim(pc.sessionId, staff.id));
      await new Promise((r) => setTimeout(r, 30));
      assert.equal((await s.get(pc.sessionId))?.lastUsedAt.getTime(), NOW, "not within the minute");
      now = NOW + TOUCH_EVERY_MS + 1_000;
      await s.check(claim(pc.sessionId, staff.id));
      await new Promise((r) => setTimeout(r, 50));
      assert.equal((await s.get(pc.sessionId))?.lastUsedAt.getTime(), NOW + TOUCH_EVERY_MS + 1_000, "after it");
      now = NOW;
      await s.end(pc.sessionId, "signed-out", staff.id);
    });

    it("tells what hangs on a session that it was ended on purpose, and hands it on when a sign-in again on the device replaces it (review of 12-Oct-2026)", async () => {
      // A phone's push registration hangs on its session (backend/notifications.ts pushDevicesFollow): a phone the super
      // admin signed out kept getting the person's alerts.
      now = NOW;
      const told: SessionsEnded[] = [];
      const s = createDeviceSessions({ store: h.store, clock, limit: null, mitraKey: "", timeZone: () => ZONE, onEnded: async (e) => void told.push(e) });
      const pc = await signIn(s, staff, browser(UA.windowsChrome, "browser-pc-000009"));
      const again = await signIn(s, staff, browser(UA.windowsChrome, "browser-pc-000009"));
      const phone = await signIn(s, staff, browser(UA.androidPhone, "browser-phone-0009"));
      assert.deepEqual(told, [{ why: "replaced", userId: staff.id, ids: [pc.sessionId], replacedBy: again.sessionId }], "the same device signed in again");
      assert.ok(await s.end(phone.sessionId, "super-admin", admin.id));
      assert.equal(await s.end(phone.sessionId, "super-admin", admin.id), null);
      assert.equal(await s.signOut(claim(again.sessionId, staff.id)), "ended");
      assert.equal(await s.signOut(claim(again.sessionId, staff.id)), "already");
      const tablet = await signIn(s, staff, browser(UA.ipad, "browser-ipad-00009"));
      const iphone = await signIn(s, staff, browser(UA.iphone, "browser-iphone-009"));
      assert.equal(await s.endAll(staff.id, "account-off", admin.id), 2);
      assert.equal(await s.endAll(staff.id, "account-off", admin.id), 0);
      assert.deepEqual(told.slice(1), [
        { why: "super-admin", userId: staff.id, ids: [phone.sessionId] },
        { why: "signed-out", userId: staff.id, ids: [again.sessionId] },
        { why: "account-off", userId: staff.id, ids: [tablet.sessionId, iphone.sessionId] },
        { why: "account-off", userId: staff.id, ids: [] },
      ], "each once; an account switched off is told even with nothing open, so its phones are forgotten");
      // A session that runs to its day's end is not ended on purpose: nothing is told of it.
      const day = await signIn(s, staff, browser(UA.windowsChrome, "browser-pc-000010"));
      now = CLOSE.getTime() + 60_000;
      assert.equal((await s.check(claim(day.sessionId, staff.id))).ok, false);
      assert.equal(told.length, 5);
      now = NOW;
      // What hangs on it failing to follow never fails the sign-out itself; it is said in the log.
      const said: string[] = [];
      const spy = mock.method(console, "error", (...args: unknown[]) => void said.push(args.map(String).join(" ")));
      try {
        const failing = createDeviceSessions({ store: h.store, clock, limit: null, mitraKey: "", timeZone: () => ZONE, onEnded: async () => {
          throw new Error("the ledger is out of reach");
        } });
        const x = await signIn(failing, staff, browser(UA.androidPhone, "browser-phone-0010"));
        assert.equal(await failing.signOut(claim(x.sessionId, staff.id)), "ended");
      } finally {
        spy.mock.restore();
      }
      assert.ok(said.some((l) => /what hangs on the ended session \(signed-out\) was not updated: the ledger is out of reach/.test(l)), said.join("\n"));
      await s.end(day.sessionId, "signed-out", staff.id);
    });

    it("lets two sign-ins at the same moment take one place between them, never both past the limit", async () => {
      now = NOW;
      const s = sessions(2);
      const pc = await signIn(s, staff, browser(UA.windowsChrome, "browser-pc-000008"));
      const [x, y] = await Promise.all([signIn(s, staff, browser(UA.androidPhone, "browser-phone-0008")), signIn(s, staff, browser(UA.iphone, "browser-iphone-008"))]);
      assert.equal([x.result.ok, y.result.ok].filter(Boolean).length, 1);
      for (const t of await s.open()) if (t.userId === staff.id) await s.end(t.id, "signed-out", staff.id);
      assert.equal(pc.result.ok, true);
    });
  });
}

contract("the sessions, kept in memory", async () => {
  const store = memorySessionStore();
  return { store, accounts: async () => undefined, close: async () => undefined };
});

const PG_URL = process.env.DCRS_SESSIONS_TEST_URL;
if (PG_URL) {
  contract("the sessions, in PostgreSQL (user_sessions)", async () => {
    const db = await import("../db.ts");
    process.env.DATABASE_URL = PG_URL;
    await db.openDatabase();
    return {
      store: postgresSessionStore(),
      accounts: async (ids) => {
        for (const id of ids) {
          await db.database().query("INSERT INTO users (id, name, email, password_hash, created_at) VALUES ($1, $1, $2, 'x', now()::text) ON CONFLICT (id) DO NOTHING", [id, `${id}@sessions.test`]);
        }
      },
      close: () => db.closeDatabase(),
    };
  });
} else {
  describe("the sessions, in PostgreSQL (user_sessions)", () => {
    it("skipped (DCRS_SESSIONS_TEST_URL is not set; the same checks run on a throwaway database when it is)", { skip: true }, () => undefined);
  });
}

// ---------------------------------------------------------------------------
// the Mitra server's key

describe("X-Mitra-Key, the Mitra server's proof (MITRA_SERVER_KEY on both servers)", () => {
  it("is compared in constant time: both sides hashed to one length, then crypto.timingSafeEqual", () => {
    const spy = mock.method(crypto, "timingSafeEqual");
    try {
      assert.equal(mitraKeyMatches(KEY, KEY), true);
      assert.equal(mitraKeyMatches(`${KEY}x`, KEY), false);
      assert.equal(mitraKeyMatches("short", KEY), false);
      assert.equal(spy.mock.callCount(), 3, "every comparison goes through timingSafeEqual");
      for (const call of spy.mock.calls) {
        const [a, b] = call.arguments as [Buffer, Buffer];
        assert.equal(a.length, 32);
        assert.equal(b.length, 32, "the same length whatever was sent, so the time says nothing of it");
      }
    } finally {
      spy.mock.restore();
    }
    assert.equal(mitraKeyMatches(KEY, ""), false, "never while no key is set");
    assert.equal(mitraKeyMatches("", KEY), false);
    assert.equal(mitraKeyMatches(undefined, KEY), false);
  });

  it("is believed only when it matches: the phone is named; otherwise it is not named, and said so", () => {
    const now = () => new Date(NOW);
    const withKey = createDeviceSessions({ store: memorySessionStore(), clock: now, limit: 2, mitraKey: KEY, timeZone: () => ZONE });
    const phoneHeaders = {
      "user-agent": "node",
      "x-client-name": "Mitra mobile app",
      "x-mitra-device-id": "3f1c2d4e-5b6a-4c7d-8e9f-0a1b2c3d4e5f",
      "x-mitra-device-name": "Kapila's phone",
      "x-mitra-device-model": "Pixel 8",
      "x-mitra-device-system": "Android 14",
      "x-mitra-device-address": "10.192.193.77",
    };
    const named = withKey.deviceOf(request({ ...phoneHeaders, "x-mitra-key": KEY }, "::ffff:127.0.0.1"));
    assert.deepEqual(named, {
      id: "3f1c2d4e-5b6a-4c7d-8e9f-0a1b2c3d4e5f",
      name: "Kapila's phone (Pixel 8)",
      category: "mobile",
      place: "phone-app",
      client: "Mitra app",
      system: "Android 14",
      address: "10.192.193.77",
    } satisfies DeviceFacts);
    assert.equal(deviceLine(named), "Kapila's phone (Pixel 8) (Mitra phone app) from 10.192.193.77");
    const wrong = withKey.deviceOf(request({ ...phoneHeaders, "x-mitra-key": "a-guess-at-the-key-000000000000" }, "::ffff:127.0.0.1"));
    assert.equal(wrong.place, "phone-app", "still the Mitra phone app");
    assert.equal(wrong.name, MITRA_UNNAMED_NAME, "a wrong key names no phone");
    assert.equal(wrong.id, "", "and its device id is not believed");
    assert.equal(wrong.address, "127.0.0.1");
    const noKey = createDeviceSessions({ store: memorySessionStore(), clock: now, limit: 2, mitraKey: "", timeZone: () => ZONE });
    assert.equal(noKey.phonesNamed, false);
    assert.equal(noKey.deviceOf(request({ ...phoneHeaders, "x-mitra-key": KEY })).name, MITRA_UNNAMED_NAME, "without a key set here, no header is believed");
    assert.equal(withKey.phonesNamed, true);
  });

  it("lists a phone signed in through the Mitra app as a mobile phone on the phone app even without the key, only not named (review of 12-Oct-2026)", async () => {
    // The owner asked to see at a glance whether a device is a computer or a mobile. Out of the box (no key on either
    // server) every phone signed in through Mitra was listed as a computer, through "another program".
    const now = () => new Date(NOW);
    const mitra = { "user-agent": "node", "x-client-name": "Mitra mobile app" };
    const noKey = createDeviceSessions({ store: memorySessionStore(), clock: now, limit: 2, mitraKey: "", timeZone: () => ZONE });
    const otherKey = createDeviceSessions({ store: memorySessionStore(), clock: now, limit: 2, mitraKey: KEY, timeZone: () => ZONE });
    const unnamed = { id: "", name: MITRA_UNNAMED_NAME, category: "mobile", place: "phone-app", client: "Mitra mobile app", system: "", address: "127.0.0.1" } satisfies DeviceFacts;
    assert.deepEqual(noKey.deviceOf(request(mitra, "::ffff:127.0.0.1")), unnamed, "no key set on this server");
    assert.deepEqual(otherKey.deviceOf(request({ ...mitra, "x-mitra-key": "a-guess-at-the-key-000000000000" }, "::ffff:127.0.0.1")), unnamed, "a key that does not match");
    assert.equal(deviceLine(unnamed), "A phone - its name is not known (set the same MITRA_SERVER_KEY on both servers) (Mitra phone app) from 127.0.0.1");
    assert.equal(deviceNameIn("gu", MITRA_UNNAMED_NAME), "એક ફોન - તેનું નામ ખબર નથી (બંને સર્વર પર એક જ MITRA_SERVER_KEY રાખો)");
    assert.equal(deviceNameIn("hi", MITRA_UNNAMED_NAME), "एक फ़ोन - उसका नाम पता नहीं (दोनों सर्वर पर एक ही MITRA_SERVER_KEY रखें)");
    // Another program signing in for somebody is still a computer through the DCRS API, named by its label.
    const other = noKey.deviceOf(request({ "user-agent": "node", "x-client-name": "Audit Assistant" }, "::ffff:10.192.193.9"));
    assert.deepEqual([other.name, other.category, other.place, other.address], ["Audit Assistant - through the DCRS API", "computer", "api", "10.192.193.9"]);
    // On the super admin's list and in a refusal of one device too many, it is the mobile on the Mitra phone app.
    const pc = await noKey.signIn({ sessionId: newId(), user: STAFF, device: noKey.deviceOf(browser(UA.windowsChrome, "browser-pc-000101")), endsAt: CLOSE });
    const phone = await noKey.signIn({ sessionId: newId(), user: STAFF, device: noKey.deviceOf(request(mitra, "::ffff:127.0.0.1")), endsAt: CLOSE });
    assert.equal(pc.ok && phone.ok, true);
    assert.deepEqual((await noKey.open()).map((s) => [sessionJson(s).category, sessionJson(s).place]), [["computer", "website"], ["mobile", "phone-app"]]);
    const third = await noKey.signIn({ sessionId: newId(), user: STAFF, device: noKey.deviceOf(browser(UA.iphone, "browser-iphone-101")), endsAt: CLOSE });
    assert.equal(third.ok, false);
    const refusal = noKey.limitRefusal(third.ok ? [] : third.holding, "en");
    assert.deepEqual(refusal.devices.map((d) => [d.category, d.place]), [["computer", "website"], ["mobile", "phone-app"]]);
    assert.match(refusal.error, /and A phone - its name is not known \(set the same MITRA_SERVER_KEY on both servers\) \(Mitra phone app, since 14:05\)\./);
  });

  it("is never written in a log or an answer, and one too short to be safe is not used", async () => {
    const said: string[] = [];
    const spies = (["log", "info", "warn", "error", "debug"] as const).map((level) =>
      mock.method(console, level, (...args: unknown[]) => {
        said.push(args.map((a) => (typeof a === "string" ? a : JSON.stringify(a))).join(" "));
      })
    );
    const answers: string[] = [];
    try {
      const short = "short-key-123";
      assert.equal(mitraServerKey({ MITRA_SERVER_KEY: short }), "", "too short to be used");
      assert.equal(mitraServerKey({ MITRA_SERVER_KEY: `  ${KEY}  ` }), KEY);
      assert.equal(mitraServerKey({}), "");
      const s = createDeviceSessions({ store: memorySessionStore(), clock: () => new Date(NOW), limit: 1, mitraKey: KEY, timeZone: () => ZONE });
      const req = request({ "user-agent": "node", "x-mitra-key": KEY, "x-mitra-device-id": "phone-device-0001", "x-mitra-device-name": "Phone" });
      const device = s.deviceOf(req);
      const first = await s.signIn({ sessionId: newId(), user: STAFF, device, endsAt: CLOSE });
      const refused = await s.signIn({ sessionId: newId(), user: STAFF, device: s.deviceOf(request({ "user-agent": UA.windowsChrome, "x-mitra-key": KEY })), endsAt: CLOSE });
      answers.push(JSON.stringify(device), deviceLine(device), JSON.stringify(first));
      if (!refused.ok) answers.push(JSON.stringify(s.limitRefusal(refused.holding, "en")));
      for (const x of await s.open()) answers.push(JSON.stringify(sessionJson(x)));
      assert.ok(said.some((line) => /MITRA_SERVER_KEY is shorter than 16 characters/.test(line)), "the short key is said once, without itself");
      for (const line of said) {
        assert.ok(!line.includes(short), "the short key is never logged");
        assert.ok(!line.includes(KEY), "the key is never logged");
      }
      for (const a of answers) assert.ok(!a.includes(KEY), "the key is in no answer");
    } finally {
      for (const spy of spies) spy.mock.restore();
    }
  });
});
