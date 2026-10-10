// THIS BROWSER AT THE SIGN-IN, AND THE WORDS OF WHERE A PERSON IS SIGNED IN (REQUIREMENTS §106).
//
// The owner, 9-Oct-2026: "one can login up to 2 devices and that Superadmin can see easily like where the ids are
// logged in like with device name and category like it is a laptop/computer or mobile."
//
//   * the website names its browser with an id of its own, made once and kept OUTSIDE the app's dcrs:v1: namespace,
//     so emptying the working copy leaves the device the same device; the id is one the server takes
//     (backend/deviceSessions.ts: 8 to 64 letters, digits, - and _), and says nothing of the person;
//   * the refusal of one device too many and the words of a session ended elsewhere are rebuilt from the server's
//     answer in the screens' language (English and Gujarati on the website; Hindi for the phone), and the server's own
//     words stand when the answer is not one of ours;
//   * every sentence of the super admin's "Signed in on" view is in English, Gujarati and Hindi.
// The server's rules are backend/tests/deviceSessions.test.ts; the page, tests/e2e_user_access.py.
// Run: npm run test:unit -- deviceSignIn
import test from "node:test";
import assert from "node:assert/strict";
import { browserDevice, browserDeviceId } from "../src/utils/deviceId";
import {
  CATEGORY_WORDS,
  PLACE_WORDS,
  deviceLimitRefusal,
  deviceLimitWordsOf,
  deviceNameIn,
  deviceViewWord,
  sessionEndedWords,
  sessionEndedWordsOf,
  BEFORE_DEVICES_NAME,
} from "../src/engine/deviceWords";

test("the browser's own id: made once, kept outside dcrs:v1:, the shape the server takes", () => {
  const first = browserDeviceId();
  assert.match(first, /^[A-Za-z0-9_-]{8,64}$/);
  assert.equal(browserDeviceId(), first, "the same id every time");
  assert.equal(window.localStorage.getItem("dcrs-device-id"), first, "kept under its own key");
  const keys = Array.from({ length: window.localStorage.length }, (_, i) => window.localStorage.key(i) ?? "");
  assert.ok(!keys.some((k) => k.startsWith("dcrs:v1:") && window.localStorage.getItem(k) === first), "never inside the app's namespace");
  const device = browserDevice();
  assert.equal(device.id, first);
  assert.ok(Number.isInteger(device.touchPoints) && device.touchPoints >= 0);
});

test("one device too many: the words rebuilt in the screens' language from the server's answer", () => {
  const answer = {
    error: "server words",
    code: "device-limit",
    limit: 2,
    devices: [
      { name: "Windows computer - Chrome", category: "computer", place: "website", since: "2026-10-09T03:32:00.000Z", sinceText: "09:02" },
      { name: "Kapila's phone (Pixel 8)", category: "mobile", place: "phone-app", since: "2026-10-09T04:45:00.000Z", sinceText: "10:15" },
    ],
  };
  assert.equal(
    deviceLimitWordsOf("en", answer),
    "This account is already signed in on 2 devices: Windows computer - Chrome (Website, since 09:02) and Kapila's phone (Pixel 8) (Mitra phone app, since 10:15). Sign out on one of them, or ask the super admin to sign one out."
  );
  assert.equal(
    deviceLimitWordsOf("gu", answer),
    "આ ખાતું પહેલેથી 2 ઉપકરણો પર સાઇન ઇન છે: Windows computer - Chrome (વેબસાઇટ, 09:02 થી) અને Kapila's phone (Pixel 8) (મિત્ર ફોન એપ, 10:15 થી). તેમાંથી એક પર સાઇન આઉટ કરો, અથવા સુપર એડમિનને એક સાઇન આઉટ કરવા કહો."
  );
  assert.equal(deviceLimitWordsOf("hi", answer), deviceLimitRefusal("hi", [
    { name: "Windows computer - Chrome", place: "website", since: "09:02" },
    { name: "Kapila's phone (Pixel 8)", place: "phone-app", since: "10:15" },
  ]));
  assert.equal(deviceLimitWordsOf("gu", { error: "Not one of ours." }), "Not one of ours.", "the server's own words stand otherwise");
  assert.equal(deviceLimitWordsOf("en", null), null);
});

test("a session ended elsewhere: how and when, in each language", () => {
  const byAdmin = { error: "x", code: "session-ended", why: "super-admin", endedAt: "2026-10-09T08:35:00.000Z", endedAtText: "14:05" };
  assert.equal(sessionEndedWordsOf("en", byAdmin), "The super admin signed this device out at 14:05. Sign in again to carry on.");
  assert.equal(sessionEndedWordsOf("gu", byAdmin), sessionEndedWords("gu", "super-admin", "14:05"));
  assert.equal(sessionEndedWords("hi", "replaced", "14:05"), "इस डिवाइस पर 14:05 बजे फिर से साइन इन हुआ, इसलिए यह पुराना साइन इन खत्म हुआ। फिर से साइन इन करें।");
  assert.match(sessionEndedWords("en", "account-off", "14:05"), /switched off/);
  assert.equal(sessionEndedWords("en", "signed-out", "14:05"), "This sign-in was signed out at 14:05. Sign in again.");
  assert.equal(sessionEndedWordsOf("en", { error: "Plain words." }), "Plain words.");
});

test("the super admin's view says every sentence in English, Gujarati and Hindi", () => {
  const keys = ["heading", "intro", "limit", "noLimit", "phonesNotNamed", "none", "unknown", "since", "lastUsed", "from", "signOut", "thisDevice", "confirmTitle", "confirmBody", "confirm", "cancel", "done", "devices", "device", "colPerson", "colDevice", "colWhere", "colSince", "colLastUsed"] as const;
  for (const lang of ["en", "gu", "hi"] as const) {
    for (const key of keys) {
      const said = deviceViewWord(lang, key, { limit: 2, n: 3, name: "Kapila", device: "iPhone - Safari", place: "Website", time: "09:02", address: "10.0.0.5" });
      assert.ok(said && !/\{\w+\}/.test(said), `${lang} ${key}: ${said}`);
      if (lang !== "en" && !["colPerson"].includes(key)) assert.notEqual(said, deviceViewWord("en", key, { limit: 2, n: 3, name: "Kapila", device: "iPhone - Safari", place: "Website", time: "09:02", address: "10.0.0.5" }), `${lang} ${key} is translated`);
    }
    for (const c of ["computer", "mobile", "tablet"] as const) assert.ok(CATEGORY_WORDS[lang][c]);
    for (const p of ["website", "phone-app", "api"] as const) assert.ok(PLACE_WORDS[lang][p]);
    assert.notEqual(deviceNameIn(lang, BEFORE_DEVICES_NAME), "");
  }
  assert.equal(deviceNameIn("gu", "iPhone - Safari"), "iPhone - Safari", "a device's own name is kept as it was made");
  assert.equal(deviceViewWord("en", "limit", { limit: 2 }), "An account may be signed in on at most 2 devices at once; one more is refused, naming the devices, until one is signed out. The super admin is not held to it.");
});
