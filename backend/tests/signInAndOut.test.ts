// SIGNING IN AND OUT AT THE DOOR, backend/signInAndOut.ts (REQUIREMENTS §84 addendum; the review of 8-Oct-2026):
//   * the sign-in throttle holds back the computer the wrong passwords came from, and only it: eight wrong passwords
//     for the super admin's address from one computer leave him free to sign in at once from his own, while that
//     computer waits out the ten minutes even with the right password (the guard against guessing stays);
//   * a sign-out's reason is written only where it fits the account: the end of the day (midnight) for the super
//     admin, the close of the hours and a refusal outside them for staff; anything else is a plain sign-out;
//   * a tab that ends its session by itself names it, and a newer session of the browser is left alone.
// The routes that use them are driven end to end by tests/e2e_working_hours.py.
// Run: npm run test:unit -- signInAndOut
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { END_OF_DAY_REASON, END_OF_HOURS_REASON, OUTSIDE_HOURS_REASON } from "../../frontend/src/engine/workingHoursCore.ts";
import { MAX_SIGN_IN_ATTEMPTS, SIGN_IN_WINDOW_MS, SIGN_OUT_WORDS, createSignInThrottle, endsThisSession, signOutWords } from "../signInAndOut.ts";

const ADMIN = "admin@gpp.local";
const STRANGER_PC = "::ffff:10.9.8.7";
const HIS_PC = "::ffff:10.9.8.20";

describe("the sign-in throttle", () => {
  it("holds back the computer the wrong passwords came from, and leaves the super admin free on his own", () => {
    const throttle = createSignInThrottle(() => 0);
    for (let n = 0; n < MAX_SIGN_IN_ATTEMPTS - 1; n++) throttle.failed(ADMIN, STRANGER_PC);
    assert.equal(throttle.held(ADMIN, STRANGER_PC), false, "seven wrong passwords are not yet eight");
    throttle.failed(ADMIN, STRANGER_PC);
    assert.equal(throttle.held(ADMIN, STRANGER_PC), true, "eight hold that computer back");
    assert.equal(throttle.held(ADMIN, HIS_PC), false, "his own computer is not held by somebody else's guesses");
    assert.equal(throttle.held("kapila.barad@gpp.local", STRANGER_PC), false, "another address from that computer is counted on its own");
  });

  it("keeps the held computer back for the whole window, then lets it try again", () => {
    let now = 1_000_000;
    const throttle = createSignInThrottle(() => now);
    for (let n = 0; n < MAX_SIGN_IN_ATTEMPTS; n++) throttle.failed(ADMIN, STRANGER_PC);
    now += SIGN_IN_WINDOW_MS;
    assert.equal(throttle.held(ADMIN, STRANGER_PC), true, "still held at the very end of the window");
    now += 1;
    assert.equal(throttle.held(ADMIN, STRANGER_PC), false, "free once the window has passed");
    assert.equal(throttle.size, 0, "and the count is forgotten");
  });

  it("starts a computer's count again when it signs in, and forgets old counts when swept", () => {
    let now = 0;
    const throttle = createSignInThrottle(() => now);
    for (let n = 0; n < MAX_SIGN_IN_ATTEMPTS - 1; n++) throttle.failed(ADMIN, HIS_PC);
    throttle.succeeded(ADMIN, HIS_PC);
    throttle.failed(ADMIN, HIS_PC);
    assert.equal(throttle.held(ADMIN, HIS_PC), false, "one wrong password after signing in is one");
    throttle.failed("kapila.barad@gpp.local", STRANGER_PC);
    assert.equal(throttle.size, 2);
    now = SIGN_IN_WINDOW_MS + 1;
    throttle.sweep();
    assert.equal(throttle.size, 0);
  });

  it("counts a request with no address it can read as one computer", () => {
    const throttle = createSignInThrottle(() => 0);
    for (let n = 0; n < MAX_SIGN_IN_ATTEMPTS; n++) throttle.failed(ADMIN, undefined);
    assert.equal(throttle.held(ADMIN, ""), true);
    assert.equal(throttle.held(ADMIN, HIS_PC), false);
  });
});

describe("the words of a sign-out", () => {
  it("says the end of the day (midnight) for the super admin alone", () => {
    assert.equal(signOutWords(END_OF_DAY_REASON, "admin"), "At the end of the day (midnight)");
    assert.equal(signOutWords(END_OF_DAY_REASON, "staff"), "", "staff's sessions end with their working hours, not at midnight");
  });

  it("says the close of the hours and a refusal outside them for staff alone", () => {
    assert.equal(signOutWords(END_OF_HOURS_REASON, "staff"), "At the close of working hours");
    assert.equal(signOutWords(OUTSIDE_HOURS_REASON, "staff"), "Outside working hours");
    assert.equal(signOutWords(END_OF_HOURS_REASON, "admin"), "", "the hours never hold the super admin");
    assert.equal(signOutWords(OUTSIDE_HOURS_REASON, "admin"), "");
  });

  it("is a plain sign-out for no reason, or one the server does not know", () => {
    for (const reason of [undefined, null, "", "constructor", "toString", 42, { reason: END_OF_DAY_REASON }]) {
      assert.equal(signOutWords(reason, "admin"), "", String(reason));
      assert.equal(signOutWords(reason, "staff"), "", String(reason));
    }
    assert.deepEqual(Object.keys(SIGN_OUT_WORDS).sort(), [END_OF_DAY_REASON, END_OF_HOURS_REASON, OUTSIDE_HOURS_REASON].sort());
  });
});

describe("which session a sign-out ends", () => {
  it("ends whatever session the browser has when none is named (the Log Out button)", () => {
    assert.equal(endsThisSession(undefined, "sess-new"), true);
    assert.equal(endsThisSession("", "sess-new"), true);
    assert.equal(endsThisSession(undefined, null), true);
  });

  it("ends the named session, and leaves a newer one of the browser alone", () => {
    assert.equal(endsThisSession("sess-old", "sess-old"), true);
    assert.equal(endsThisSession("sess-old", "sess-new"), false, "signed in again in another tab meanwhile");
    assert.equal(endsThisSession("sess-old", null), false, "a token from before ids is not the session named");
    assert.equal(endsThisSession("sess-old", undefined), false, "no cookie: nothing of the browser's to end");
  });
});
