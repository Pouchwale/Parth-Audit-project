import { assistantConfigured } from "./features";

// CAN MITRA'S MODEL BE REACHED RIGHT NOW? (REQUIREMENTS §72)
//
// The plant noticed that the assistant answered perfectly with the internet
// switched off, and asked why it was not using the API. It was not: the app
// answered every question from its own tables first (engine/assistantLocal.ts)
// and only fell through to the model for what those tables could not handle.
// The tables are good, and offline they are all there is — but a person could
// not tell which of the two had answered, and that is the part that was wrong.
//
// So now the MODEL answers, and this module decides only ONE thing: whether to
// bother trying.
//
// AND IT ANSWERS THAT AS NARROWLY AS IT CAN. The first version of this file
// also refused to try when the server had reported no GROQ_API_KEY, and
// remembered a failure for twenty seconds so the next few messages would not
// each wait out the same timeout. Both were the client second-guessing the
// server, and both were wrong:
//
//   * tests/e2e_capa_formats.py STUBS /api/assistant/chat to check the app's
//     own refusal of an out-of-order checklist answer "deterministically, and
//     with no network call" — a request that is never made cannot be stubbed,
//     and the check failed. Anything else standing in for that endpoint — a
//     proxy, a different model, a plant's own server — would have been skipped
//     the same way.
//   * a remembered failure makes the app stop trying while the person watches
//     it not try, and it can only ever be out of date.
//
// A request to OUR OWN server is not the slow thing: if there is no key it
// fails at once, without any call to Groq. So the only case worth short-
// circuiting is the one the browser can actually be sure of — no network at
// all. Everything else is attempted, and the server's answer decides.

/** Why the model could not answer — what the person is told, in the app's own words. */
export type Unreachable = "offline" | "not-configured" | "failed";

/** The machine's own answer. `true` in a non-browser context, where there is nothing to ask. */
const browserOnline = (): boolean => (typeof navigator === "undefined" || typeof navigator.onLine !== "boolean" ? true : navigator.onLine);

/**
 * WHETHER TO ASK THE MODEL. No is returned only when this browser has no
 * network at all — the one thing it can be certain of. When this says no, the
 * caller answers from the app's own tables and SAYS SO; it never passes that
 * answer off as the model's, which is the whole complaint this exists for.
 */
export function modelReachable(): { ok: true } | { ok: false; why: Unreachable } {
  if (!browserOnline()) return { ok: false, why: "offline" };
  return { ok: true };
}

/**
 * A request to the model failed, and this is the honest reason to give for it.
 * The distinction matters: telling somebody their internet is down when the
 * server simply has no key set would send them to fix the wrong thing.
 */
export function noteModelFailed(): Unreachable {
  if (!browserOnline()) return "offline";
  return assistantConfigured() ? "failed" : "not-configured";
}

/** The model answered. Nothing is remembered either way, so there is nothing to clear. */
export function noteModelAnswered(): void {
  /* nothing to do: no failure is cached, on purpose — see the note above. */
}
