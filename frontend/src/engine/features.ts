// WHAT THIS SERVER HAS SWITCHED ON (REQUIREMENTS §65).
//
// Demo Mode — the switch in the top bar, its page, its banner and watermark —
// is not part of the product: the portal is in real use, and a person must
// never be able to reach a screen of synthetic records. The year of synthetic
// records it makes is still what the Playwright suites stand on, so the SERVER
// decides: started with DEMO_MODE=1 (scripts/run-e2e.ts does) it says so in the
// answer the app already waits for before it draws anything — who is signed in
// (backend/index.ts, store/AuthContext.tsx) — and everything here reads that
// answer synchronously. Anything else, no answer included, is OFF.
//
// Only the SWITCH lives here. A record's isDemo field, the pages' isDemo
// filters and the behaviour model the generator shares with the Live pre-fill
// (engine/plantSimulation.ts) stay exactly as they are.
let demoMode = false;
// Whether the server has answered at all. Hiding Demo Mode needs no answer;
// REMOVING the demo records an earlier version left behind does (data/bootstrap.ts).
let told = false;

export function setFeatures(f: { demoMode?: boolean } | undefined): void {
  demoMode = f?.demoMode === true;
  told = typeof f?.demoMode === "boolean";
}

export function demoModeAvailable(): boolean {
  return demoMode;
}

/** The server itself said this installation has no Demo Mode — not merely said nothing. */
export function demoModeRuledOut(): boolean {
  return told && !demoMode;
}
