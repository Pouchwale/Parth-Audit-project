// THE ACCOUNTS' WORDS AND NAMES (REQUIREMENTS §110), engine/accountWords.ts and engine/accountNames.ts.
//
//   * every sentence in English, Gujarati and Hindi, none empty, each with the same {names} in all three, and no em
//     dash in Gujarati or Hindi; the language a request asks for; "View" the master list's word for Read;
//   * THE SHORT NAME: "kapila.barad", "Kapila Barad" or "  KAPILA   BARAD " is kapila.barad@gpp.local; an address is
//     taken as it is, in small letters; nothing is guessed; the short name of a sign-in of the plant's own, and of no other;
//   * a sign-in given up to another account: never typed, and known again as the sign-in it was;
//   * a session ended by a rename is told so in three languages (engine/deviceWords.ts).
// Run: npm run test:unit -- accountWords
import test from "node:test";
import assert from "node:assert/strict";
import { ACCOUNT_WORDS, accountLanguageOf, accountWord, masterLevelName } from "../src/engine/accountWords";
import { RELEASED_MARK, releasedFrom, releasedSignIn, shortSignIn, shownSignIn, signInAddress } from "../src/engine/accountNames";
import { sessionEndedWords, sessionEndedWordsOf } from "../src/engine/deviceWords";

const names = (s: string): string[] => (s.match(/\{(\w+)\}/g) ?? []).sort();

test("every sentence in English, Gujarati and Hindi, with the same names to fill and no em dash in Gujarati or Hindi", () => {
  const keys = Object.keys(ACCOUNT_WORDS.en);
  assert.ok(keys.length > 100, `${keys.length} sentences`);
  for (const lang of ["gu", "hi"] as const) {
    assert.deepEqual(Object.keys(ACCOUNT_WORDS[lang]).sort(), keys.slice().sort(), lang);
    for (const key of keys) {
      const en = ACCOUNT_WORDS.en[key as keyof typeof ACCOUNT_WORDS.en];
      const said = ACCOUNT_WORDS[lang][key as keyof typeof ACCOUNT_WORDS.en];
      assert.ok(said.trim().length > 0, `${lang} ${key}`);
      assert.deepEqual(names(said), names(en), `${lang} ${key}: the same names to fill`);
      assert.ok(!said.includes("—"), `${lang} ${key}: no em dash`);
    }
  }
  assert.equal(accountLanguageOf("gu"), "gu");
  assert.equal(accountLanguageOf("hi"), "hi");
  assert.equal(accountLanguageOf("fr"), "en");
  assert.equal(accountLanguageOf(undefined), "en");
  assert.equal(accountWord("en", "users.removeTitle", { name: "Anil Ravad" }), "Remove Anil Ravad?");
  assert.equal(accountWord("en", "users.removeTitle"), "Remove {name}?", "a name nobody gave stays as it is");
  assert.equal(masterLevelName("en", "read"), "View", "View and Read are one level: the master list says View");
  assert.equal(accountWord("en", "ml.menu.read"), "View (Read)");
});

test("THE SHORT NAME: kapila.barad, Kapila Barad and KAPILA BARAD are kapila.barad@gpp.local; an address is taken as it is", () => {
  for (const typed of ["kapila.barad", "Kapila Barad", "  KAPILA   BARAD ", "kapila barad", "Kapila.Barad"]) assert.equal(signInAddress(typed), "kapila.barad@gpp.local", typed);
  assert.equal(signInAddress("kapila.barad@gpp.local"), "kapila.barad@gpp.local");
  assert.equal(signInAddress("  KapilaBarad01@Gmail.com "), "kapilabarad01@gmail.com", "an address: trimmed and in small letters, as before");
  assert.equal(signInAddress("kapila"), "kapila@gpp.local", "nothing is guessed: kapila is kapila@gpp.local, nobody's");
  assert.equal(signInAddress(""), "");
  assert.equal(signInAddress(undefined), "");
  assert.equal(signInAddress(42), "");
  assert.equal(shortSignIn("kapila.barad@gpp.local"), "kapila.barad");
  assert.equal(shortSignIn("Vinay.Bhojak@GPP.local"), "vinay.bhojak");
  assert.equal(shortSignIn("kapilabarad01@gmail.com"), null, "only the plant's own sign-ins have a short name");
  assert.equal(shortSignIn(releasedSignIn("kapila.barad@gpp.local", "u-1")), null);
});

test("a sign-in given up to another account is never one a person types, and is known again as the sign-in it was", () => {
  const given = releasedSignIn("Kapila.Barad@gpp.local", "3F1C2D4E-5B6A-4C7D-8E9F-0A1B2C3D4E5F");
  assert.equal(given, `kapila.barad@gpp.local${RELEASED_MARK}3f1c2d4e5b6a4c7d8e9f0a1b2c3d4e5f`);
  assert.equal(releasedFrom(given), "kapila.barad@gpp.local");
  assert.equal(shownSignIn(given), "kapila.barad@gpp.local");
  assert.equal(releasedFrom("kapila.barad@gpp.local"), null);
  assert.equal(shownSignIn("kapila.barad@gpp.local"), "kapila.barad@gpp.local");
});

test("a session ended by a rename is told so, in three languages", () => {
  assert.equal(sessionEndedWords("en", "renamed", "14:05"), "The super admin changed this account's sign-in at 14:05. Sign in again with the new one.");
  assert.match(sessionEndedWords("gu", "renamed", "14:05"), /સાઇન ઇન બદલ્યું/);
  assert.match(sessionEndedWords("hi", "renamed", "14:05"), /साइन इन बदला/);
  assert.equal(sessionEndedWordsOf("en", { error: "x", why: "renamed", endedAtText: "09:00" }), "The super admin changed this account's sign-in at 09:00. Sign in again with the new one.");
});
