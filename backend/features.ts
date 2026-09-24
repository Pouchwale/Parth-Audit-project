// WHAT THIS SERVER HAS SWITCHED ON (REQUIREMENTS §65).
//
// Demo Mode is not part of the product: nobody using the portal sees its
// switch, its page or its banner, and Mitra is never told the page exists. The
// year of synthetic records it makes is what the Playwright suites stand on, so
// it is switched on by whoever STARTS the server — DEMO_MODE=1, which
// scripts/run-e2e.ts sets — and by nothing a person can do in the browser. Read
// once, here (after backend/.env, so the file can set it too); the browser is
// told with who is signed in (index.ts: /api/auth/me, login, signup) and reads
// it in frontend/src/engine/features.ts.
import "./env.ts";

export const DEMO_MODE = process.env.DEMO_MODE === "1";

// WHETHER ANYBODY MAY CREATE THEIR OWN ACCOUNT (REQUIREMENTS §66). In the plant
// they may not: the super admin makes each person's account and says which
// departments it may see, and the sign-in screen offers nothing else. Every
// Playwright suite begins by signing itself up, so the flag exists for the test
// server (scripts/run-e2e.ts sets ALLOW_SIGNUP=1) and for the one case a real
// installation needs it — the very first administrator on an empty database,
// when the seeded accounts have been left out.
export const ALLOW_SIGNUP = process.env.ALLOW_SIGNUP === "1";

// WHETHER THERE IS A MODEL TO ASK AT ALL (REQUIREMENTS §72). Mitra's replies
// come from Groq (backend/groq.ts), which needs GROQ_API_KEY. Without it there
// is no model for anybody, and the app must say THAT rather than blame the
// person's internet — or, worse, answer from its own tables and let them think
// they were talking to the model. Only WHETHER a key is set is ever sent; the
// key itself never leaves the server.
export const ASSISTANT_CONFIGURED = !!(process.env.GROQ_API_KEY ?? "").trim();

/** What the browser is told, beside the account — and, before anybody signs in, by GET /api/auth/config. */
export const FEATURES = { demoMode: DEMO_MODE, signup: ALLOW_SIGNUP, assistant: ASSISTANT_CONFIGURED };
