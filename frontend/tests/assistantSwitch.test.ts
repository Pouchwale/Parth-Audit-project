// MITRA FOR THIS PERSON (engine/features.ts assistantAvailable, the owner, 2-Nov-2026): what the server says with who is
// signed in — the super admin always has Mitra, the staff until the super admin switches it off — and an older server
// that says nothing is taken to allow it.
// Run: npm run test:unit -- assistantSwitch
import test from "node:test";
import assert from "node:assert/strict";
import { assistantAvailable, assistantConfigured, setFeatures } from "../src/engine/features";

test("Mitra is on unless the server says it is off for this person, whatever else it says", () => {
  setFeatures(undefined);
  assert.equal(assistantAvailable(), true, "a server that says nothing: allowed");
  setFeatures({ demoMode: false, signup: false, assistant: true });
  assert.equal(assistantAvailable(), true, "an older server that knows no switch: allowed");
  setFeatures({ demoMode: false, signup: false, assistant: true, mitra: false });
  assert.equal(assistantAvailable(), false, "switched off for the staff");
  assert.equal(assistantConfigured(), true, "the model's own flag is another matter");
  setFeatures({ demoMode: false, signup: false, assistant: false, mitra: true });
  assert.equal(assistantAvailable(), true, "the super admin, on a server with no model: Mitra's page still answers from the app's tables");
});
