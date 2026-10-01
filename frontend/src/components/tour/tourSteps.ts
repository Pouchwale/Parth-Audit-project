// THE GUIDED TOUR OF THE WHOLE SOFTWARE (REQUIREMENTS §85) — what it says, where it
// points, and when it starts by itself. Pure: no React and no DOM here, so every
// rule is tested without a browser (frontend/tests/tour.test.ts); GuidedTour.tsx
// draws it.
//
// The owner, 30-Sep-2026: "whenever a user comes to the dashboard, including the
// super admin, the software gives a tour of the whole software, and the user can
// skip it too."
//
// Each step spotlights a real part of the screen AS THAT PERSON SEES IT — their own
// sidebar and modules, their own day, their own bell — and says in two short lines
// what it is for. The super admin's tour has five more steps: the pages only they
// have. A step whose part is not on this person's screen at all is left out, so the
// counter never counts a step that shows nothing.

export interface TourStep {
  /** A name for the step (data-step on the tour, for the suites). */
  id: string;
  title: string;
  /** What it is for, in two short lines. */
  text: string;
  /**
   * Where it points: CSS selectors, and the parts of the screen they find are
   * spotlit together. None: the card stands in the middle of the screen.
   */
  target?: string[];
  /** When no part of `target` can be seen (the menu is closed, a phone): these instead, with `fallbackText`. */
  fallback?: string[];
  fallbackText?: string;
}

export interface TourPerson {
  /** The name the account goes by. */
  name: string;
  /** The super admin (role "admin"): five more steps. */
  admin: boolean;
  /** The modules in this person's sidebar, as the sidebar names them, in its order. */
  modules: string[];
}

/** The first name, for the welcome ("Parth Raval" → "Parth"). */
export function firstName(name: string): string {
  return (name || "").trim().split(/\s+/)[0] ?? "";
}

/** A list the way a person says it: "A", "A and B", "A, B and C", "A, B, C, D and 3 more". */
export function listInWords(items: string[], max = 4): string {
  const list = items.map((s) => s.trim()).filter(Boolean);
  if (list.length === 0) return "";
  if (list.length === 1) return list[0];
  if (list.length <= max) return `${list.slice(0, -1).join(", ")} and ${list[list.length - 1]}`;
  return `${list.slice(0, max).join(", ")} and ${list.length - max} more`;
}

// Where a sidebar link is, and what to point at when the sidebar is out of sight.
const MENU_BUTTON = ["[data-action='toggle-sidebar']"];
const sidebarLink = (route: string) => [`#app-sidebar a[href='#${route}']`];
const inMenu = (where: string) => `The button at the top left opens the menu. ${where}.`;

/** The steps of the tour for this person, in order. */
export function tourSteps(person: TourPerson): TourStep[] {
  const first = firstName(person.name);
  const modules = person.modules.filter(Boolean);
  const steps: TourStep[] = [
    {
      id: "welcome",
      title: first ? `Welcome to DCRS, ${first}` : "Welcome to DCRS",
      text: "A one-minute look round the whole system. Next and Back move through it; Skip tour or the Escape key ends it at any time.",
    },
    {
      id: "sidebar",
      title: "Your menu",
      text: "Everything you can open is here: your workspace at the top, your modules below it, and the system pages at the bottom.",
      target: ["#app-sidebar .app-nav"],
      fallback: MENU_BUTTON,
      fallbackText: "Everything you can open is in the menu. This button shows it or hides it; on a phone it slides in from the left.",
    },
  ];
  if (modules.length > 0) {
    steps.push({
      id: "modules",
      title: modules.length === 1 ? "Your module" : `Your ${modules.length} modules`,
      text: `${listInWords(modules)}. Open one to reach its documents and registers; its arrow folds it away.`,
      target: ["#app-sidebar .nav-module-header"],
      fallback: MENU_BUTTON,
      fallbackText: inMenu(`Your modules are in it: ${listInWords(modules)}`),
    });
  }
  steps.push(
    {
      id: "day",
      title: "Your day",
      text: "What is due today, what you have finished, your streak and the next thing to do. The tiles below count today and this month.",
      target: ["[data-section='my-day']"],
      // Demo Mode has no card of the person's own day: the day's tiles instead.
      fallback: ["[data-tour='today-tiles']"],
    },
    {
      id: "search",
      title: "Search",
      text: "Find any document by its number (F/HR/17, fhr17) or any word of its name, and any record by what was written in it.",
      target: sidebarLink("/search"),
      fallback: MENU_BUTTON,
      fallbackText: inMenu("Search: any document by its number or name, and any record by what was written in it"),
    },
    {
      id: "calendar",
      title: "Record Calendar",
      text: "Every day's records at a glance — due, done and late — with the plant's holidays marked. Click a day to see and open its records.",
      target: sidebarLink("/calendar"),
      fallback: ["[data-tour='open-calendar']"],
      fallbackText: "Every day's records at a glance — due, done and late — with the plant's holidays marked. This button opens it too.",
    },
    {
      id: "library",
      title: "Document Library",
      text: "Every document you work with, module by module: open one to see its records or start a new one. Document Files keeps every record filed by month.",
      target: sidebarLink("/library"),
      fallback: MENU_BUTTON,
      fallbackText: inMenu("Document Library: every document you work with, module by module"),
    },
    {
      id: "records",
      title: "Records due today — and Submit and Verify",
      text: "Open a record to fill it in. On the record, Submit sends it for checking and Verify is the checker's sign-off; a record sent back comes to you with the reason.",
      target: ["[data-tour='records-due']"],
    },
    {
      id: "mitra",
      title: "Mitra, your assistant",
      text: "Ask in words or by voice — what is due, open a record, fill it in, find something. Today's briefing in the top bar is Mitra's summary of your day.",
      target: [".assistant-pill", ".assistant-dock-card"],
      fallback: sidebarLink("/assistant"),
      fallbackText: "Ask Mitra in words or by voice — what is due, open a record, fill it in, find something.",
    },
    {
      id: "bell",
      title: "Reminders",
      text: "The bell counts what is waiting for you, overdue first. Open it to go straight to each one.",
      target: [".app-topbar button[aria-label='Reminders']"],
    },
    {
      id: "sound",
      title: "Sound and voice",
      text: "Chimes and Mitra's spoken reminders. One press mutes them all; press again to bring them back.",
      target: [".app-topbar [data-action='toggle-sound']"],
    },
    {
      id: "reports",
      title: "Reports, Performance and Insights",
      text: "Monthly reports, trends and downloads. Performance shows who finished on time; Insights reads the records together.",
      target: [...sidebarLink("/reports"), ...sidebarLink("/performance"), ...sidebarLink("/insights")],
      fallback: MENU_BUTTON,
      fallbackText: inMenu("Reports, Performance and Insights are at the bottom, under System"),
    }
  );
  if (person.admin) {
    steps.push(
      {
        id: "users",
        title: "Users & Access",
        text: "Make every account, reset a password, switch an account off, and say which departments each person may see.",
        target: sidebarLink("/users"),
        fallback: MENU_BUTTON,
        fallbackText: inMenu("Users & Access: every account and which departments it sees"),
      },
      {
        id: "access",
        title: "User access",
        text: "Add a person to any module or take them off it, see which documents each can open, and when each signed in and out.",
        target: sidebarLink("/access"),
        fallback: MENU_BUTTON,
        fallbackText: inMenu("User access: modules for each person, and every sign-in and sign-out"),
      },
      {
        id: "database",
        title: "Database overview",
        text: "What the shared database holds, in plain words, read straight from it. Nothing on that page can change anything.",
        target: sidebarLink("/database-overview"),
        fallback: MENU_BUTTON,
        fallbackText: inMenu("Database overview: the shared database in plain words, read-only"),
      },
      {
        id: "master",
        title: "Master Data",
        text: "The lists every form draws on — people, machines, areas, the holiday calendar — and the plant's working hours and Mitra's voice.",
        target: sidebarLink("/master-data"),
        fallback: MENU_BUTTON,
        fallbackText: inMenu("Master Data: the lists every form draws on, the calendar and the working hours"),
      },
      {
        id: "activity",
        title: "Activity Log",
        text: "Everything anybody did — sign-ins, saves, submissions, verifications — with who and when. It can be exported and archived.",
        target: sidebarLink("/activity"),
        fallback: MENU_BUTTON,
        fallbackText: inMenu("Activity Log: everything anybody did, with who and when"),
      }
    );
  }
  steps.push({
    id: "finish",
    title: "That's the tour",
    text: "Take it again any time with this button. It starts by itself once a day until you tick “Don't show this again”.",
    target: ["[data-action='take-tour']"],
  });
  return steps;
}

/**
 * Whether the tour starts by itself on this visit to the Dashboard: once a day,
 * on the first visit, until the person asks not to see it again — and never
 * under automation (navigator.webdriver): the 51 suites that do not know it
 * exists must never find it over the Dashboard (tests/e2e_tour.py overrides
 * navigator.webdriver to test the real start).
 */
export function tourStartsByItself(flags: { off: boolean; startedOn: string | null }, todayISO: string, automated: boolean): boolean {
  if (automated || flags.off) return false;
  return flags.startedOn !== todayISO;
}

export interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** The smallest box around all of them; null for none. */
export function unionBox(boxes: Box[]): Box | null {
  const real = boxes.filter((b) => b.width > 0 && b.height > 0);
  if (real.length === 0) return null;
  const left = Math.min(...real.map((b) => b.left));
  const top = Math.min(...real.map((b) => b.top));
  const right = Math.max(...real.map((b) => b.left + b.width));
  const bottom = Math.max(...real.map((b) => b.top + b.height));
  return { left, top, width: right - left, height: bottom - top };
}

/** A box grown by `pad` and cut to the window (less `margin` all round); null when nothing of it is on the screen. */
export function spotFor(box: Box | null, view: { width: number; height: number }, pad = 6, margin = 4): Box | null {
  if (!box) return null;
  const left = Math.max(margin, box.left - pad);
  const top = Math.max(margin, box.top - pad);
  const right = Math.min(view.width - margin, box.left + box.width + pad);
  const bottom = Math.min(view.height - margin, box.top + box.height + pad);
  if (right - left < 4 || bottom - top < 4) return null;
  return { left, top, width: right - left, height: bottom - top };
}

export type CardSide = "right" | "left" | "bottom" | "top" | "over" | "center";

/**
 * Where the card goes: beside the spotlit part where there is room (right first —
 * the sidebar is on the left — then below, above, left), else over it at the
 * bottom of the window; in the middle when nothing is spotlit. Always inside
 * the window, `margin` from its edges.
 */
export function placeCard(spot: Box | null, card: { width: number; height: number }, view: { width: number; height: number }, gap = 14, margin = 12): { left: number; top: number; side: CardSide } {
  const clampX = (x: number) => Math.max(margin, Math.min(x, view.width - card.width - margin));
  const clampY = (y: number) => Math.max(margin, Math.min(y, view.height - card.height - margin));
  if (!spot) return { left: clampX((view.width - card.width) / 2), top: clampY((view.height - card.height) / 2), side: "center" };
  const right = spot.left + spot.width;
  const bottom = spot.top + spot.height;
  if (right + gap + card.width + margin <= view.width) return { left: right + gap, top: clampY(spot.top), side: "right" };
  if (bottom + gap + card.height + margin <= view.height) return { left: clampX(spot.left + spot.width / 2 - card.width / 2), top: bottom + gap, side: "bottom" };
  if (spot.top - gap - card.height >= margin) return { left: clampX(spot.left + spot.width / 2 - card.width / 2), top: spot.top - gap - card.height, side: "top" };
  if (spot.left - gap - card.width >= margin) return { left: spot.left - gap - card.width, top: clampY(spot.top), side: "left" };
  return { left: clampX((view.width - card.width) / 2), top: clampY(view.height - card.height - margin), side: "over" };
}
