// HOW MITRA FEELS (REQUIREMENTS §122; the owner, 24-Oct-2026: "add more capabilites and emotions like mitra is
// enjoying on every task that user will complete and sad, angry and it should be like fun to complete the task so
// user fill happy and it like playing game").
//
// One pure rule, read by the Ask Mitra pill (components/common/DocumentAssistant.tsx) and tested without a browser:
// the moment a record is handed in or verified Mitra is DELIGHTED (joy, a few seconds); while the person's own work
// is overdue it is DOWNCAST (sad), and CROSS once a pile of it is (upset); while something is due it is ATTENTIVE
// (calm); with nothing waiting, simply HAPPY. A send-back dips the face for a moment too. Never a scolding: "upset"
// only draws the frown — every word beside it (the reminders, the toasts) stays kind, as REQUIREMENTS §81 asks.
export type MitraMood = "joy" | "happy" | "calm" | "sad" | "upset";

/** A burst of feeling on top of the day's standing: a submit's joy, a send-back's dip. */
export type MoodLift = "joy" | "sad" | null;

export interface MoodFacts {
  /** How much of the person's own work is waiting (the pill's figure, REQUIREMENTS §67). */
  waiting: number;
  /** How much of it is overdue. */
  overdue: number;
  lift?: MoodLift;
}

export function moodFor(f: MoodFacts): MitraMood {
  if (f.lift) return f.lift === "joy" ? "joy" : "sad";
  if (f.overdue >= 3) return "upset";
  if (f.overdue >= 1) return "sad";
  if (f.waiting >= 1) return "calm";
  return "happy";
}

/** How long a burst of feeling stays on the face before the day's standing shows again. */
export const MOOD_LIFT_MS = 6000;
