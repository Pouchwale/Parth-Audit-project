import React, { createContext, useContext, useEffect, useState } from "react";
import { HR_MASTER_SLUG, HR_PAGE_SLUGS } from "../data/seed/hrModule";
import { demoModeAvailable } from "../engine/features";

// Minimal dependency-free hash router (react-router-dom is not available in
// this offline build — see DEPLOYMENT.md). Hash-based routing also means the
// built app works from a plain `file://` or any static file server with zero
// server-side rewrite configuration, which matters for an "internal LAN
// pilot" deployment (section 44).

function currentPath(): string {
  const h = window.location.hash.replace(/^#/, "");
  return h || "/";
}

interface RouterValue {
  path: string;
  segments: string[];
  navigate: (path: string) => void;
  /** Back to the page you came from, or to `fallback` (the Dashboard) when this screen was opened straight from an address. */
  back: (fallback?: string) => void;
  /** Back to `path` if that is where you came from (keeping the browser's history in step), otherwise open it. */
  backTo: (path: string) => void;
}

// WHERE YOU CAME FROM, for the app's own Back buttons (REQUIREMENTS §48).
//
// The browser's history can't tell whether the entry before this one is a page
// of this app: a screen opened from a bookmark, a new tab or a link somebody
// sent has nothing of the app behind it, and history.back() would leave the
// app. So the router keeps the trail itself. A change of address made through
// navigate() is a step forward; any other change — the browser's Back and
// Forward, a page's own history.back() — is a step back when it returns to the
// address before this one, and a step forward otherwise. Back then goes back
// through the browser, so its history stays in step, whenever the trail has
// somewhere to go.
const trail: string[] = [currentPath()];
let navigating = false;

function followAddress(path: string): void {
  if (trail[trail.length - 1] !== path) {
    if (!navigating && trail.length >= 2 && trail[trail.length - 2] === path) trail.pop();
    else trail.push(path);
  }
  navigating = false;
}

// A SCREEN HOLDING WORK NOBODY HAS SAVED MAY ASK BEFORE IT IS LEFT (REQUIREMENTS §64).
//
// The sheet designer holds a draft of a format. A link in the sidebar, a Back
// button or Mitra opening another page would unmount it and the draft would be
// gone without a word. So such a screen registers a guard WHILE it has
// something to lose: every move then goes to the guard instead, which shows
// its own pop-up and calls `go` if the person says to leave. Logging out is
// asked about the same way (confirmLeave). A session the server has ended
// cannot be: there is nobody left to ask on behalf of.
type LeaveGuard = (go: () => void) => void;
let leaveGuard: LeaveGuard | null = null;
// The next change of address is one the app made itself, already asked about.
let leaveApproved = false;
// Inside a move the person has just agreed to: whatever it does is not asked about again.
let passing = false;

/** Registers the guard; returns what takes it off again. One at a time: there is one screen. */
export function setLeaveGuard(guard: LeaveGuard): () => void {
  leaveGuard = guard;
  return () => {
    if (leaveGuard === guard) leaveGuard = null;
  };
}

function pass(go: () => void): void {
  passing = true;
  try {
    go();
  } finally {
    passing = false;
  }
}

function guarded(go: () => void): void {
  if (!leaveGuard || passing) return go();
  leaveGuard(() => pass(go));
}

/**
 * For whatever takes the screen away WITHOUT changing the address — logging
 * out — or does work before it moves — starting a record and then opening it:
 * `then` runs at once when nothing is unsaved, and after the person agrees to
 * leave when something is.
 */
export function confirmLeave(then: () => void): void {
  guarded(then);
}

// WHERE EACH ENTRY IS IN THE TAB'S HISTORY. The browser's own Back and Forward
// cannot be stopped, only undone: by the time the app hears of one the address
// has moved. To undo it without adding an entry of the app's own — which would
// leave the page the person declined sitting behind the sheet, and lose what
// was ahead — every entry carries its place in history.state, so the way back
// onto the sheet's own entry is a number, and so is the way to go again once
// the person agrees. An entry with no place is one just made (a typed address),
// one step ahead.
let position = 0;
function placeOf(): number | undefined {
  const s = window.history.state as { dcrsIndex?: unknown } | null;
  return s && typeof s.dcrsIndex === "number" ? s.dcrsIndex : undefined;
}
function stampPlace(): void {
  const s = window.history.state;
  window.history.replaceState({ ...(s && typeof s === "object" ? s : {}), dcrsIndex: position }, "");
}
/** After a change of address that stands: read this entry's place, or give a new entry the next one. */
function settlePlace(): void {
  const at = placeOf();
  if (at === undefined) {
    position += 1;
    stampPlace();
  } else position = at;
}

const RouterContext = createContext<RouterValue | null>(null);

export function RouterProvider({ children }: { children: React.ReactNode }) {
  const [path, setPath] = useState(currentPath());

  useEffect(() => {
    const here = placeOf();
    if (here === undefined) stampPlace();
    else position = here;

    const onHashChange = () => {
      const next = currentPath();
      const shown = trail[trail.length - 1];
      if (leaveGuard && !leaveApproved && next !== shown) {
        // The browser's own Back or Forward, or an address typed: it has already
        // moved. The tab is stepped back onto the sheet's own entry — nothing is
        // added to its history, and the hashchange that causes names the address
        // already shown, so it passes below without a stir — and the guard asks.
        // Agreed to, the very same step is taken again, so a Back stays a Back:
        // the trail pops, and the next Back goes where it always would have.
        const at = placeOf();
        const steps = at === undefined ? -1 : position - at;
        if (steps !== 0) window.history.go(steps);
        else window.history.pushState({ dcrsIndex: position }, "", `#${shown}`);
        leaveGuard(() =>
          pass(() => {
            leaveApproved = true;
            if (steps !== 0) window.history.go(-steps);
            else {
              navigating = true;
              window.location.hash = next;
            }
          })
        );
        return;
      }
      leaveApproved = false;
      settlePlace();
      followAddress(next);
      setPath(next);
    };
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  const navigate = (next: string) => {
    const target = next.startsWith("/") ? next : `/${next}`;
    // The same address again fires no hashchange, so only a real move is marked — and asked about.
    if (target === currentPath()) return;
    guarded(() => {
      leaveApproved = true;
      navigating = true;
      window.location.hash = target;
    });
  };

  const back = (fallback = "/dashboard") => {
    if (trail.length >= 2)
      guarded(() => {
        leaveApproved = true;
        window.history.back();
      });
    else navigate(fallback);
  };

  const backTo = (to: string) => {
    const previous = trail[trail.length - 2];
    if (previous !== undefined && (previous === to || previous.startsWith(`${to}/`)))
      guarded(() => {
        leaveApproved = true;
        window.history.back();
      });
    else navigate(to);
  };

  const segments = path.split("/").filter(Boolean);

  return <RouterContext.Provider value={{ path, segments, navigate, back, backTo }}>{children}</RouterContext.Provider>;
}

export function useRouter(): RouterValue {
  const ctx = useContext(RouterContext);
  if (!ctx) throw new Error("useRouter must be used within RouterProvider");
  return ctx;
}

// Every path shape the app's router actually understands (see App.tsx's
// RouteSwitch). Used to sanity-check a route the assistant wants to
// navigate to BEFORE calling navigate() with it — the model only ever picks
// a destination, it never runs code, but a hallucinated or malformed path
// would otherwise silently land on NotFoundPage. Kept in sync by hand with
// backend/assistant.ts's ROUTE_GUIDE (the prompt describing these same
// shapes) and with App.tsx's switch.
// "gap"/"training"/"soc"/"record" are NOT here — they're handled below with
// their own case (root, optional id), not as a zero-segment-only route. Nor is
// "demo", which is a route only where the server has Demo Mode switched on.
const SIMPLE_ROUTES = new Set([
  "", "dashboard", "library", "calendar", "reports",
  "chemical-master", "master-data", "search", "pest-control", "assistant", "licence",
  // /insights — what the plant's records show when they are read together (REQUIREMENTS §75).
  "insights",
  // /qc — QC Records, Quality Control's own overview (REQUIREMENTS §58).
  "qc",
  // /activity — the Activity Log (REQUIREMENTS §62).
  "activity",
  // /users — Users & Access, the administrator's own (REQUIREMENTS §66).
  "users",
  // /performance — the scorecard: who did their documents on time (REQUIREMENTS §64).
  "performance",
]);
const REPORT_TABS = new Set(["monthly", "daily", "rodent", "lizard", "flycatcher", "chemical", "gap", "training", "lamination"]);
// Pest Control module pages (src/pages/PestControlPages.tsx):
// /pest/daily[/{year}/{month0}], /pest/service/{slug}[/{year}], /pest/trend/{slug}[/{year}]
const PEST_SERVICE_SLUGS = new Set(["rodent", "general", "fly"]);
const PEST_TREND_SLUGS = new Set(["rodent", "lizard", "fly-catcher"]);
export const YEAR_RE = /^\d{4}$/;
export const MONTH0_RE = /^(?:0?[0-9]|1[01])$/; // 0-11, optional leading zero
export const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const SLUG_RE = /^[a-z0-9-]+$/;

export function isValidAppRoute(path: string): boolean {
  if (typeof path !== "string" || !path.startsWith("/")) return false;
  const segments = path.split("/").filter(Boolean);
  if (segments.length === 0) return true; // "/" -> dashboard
  const [root, ...rest] = segments;

  switch (root) {
    case "day":
      return rest.length === 1 && ISO_DATE_RE.test(rest[0]);
    case "calendar":
      return rest.length === 0 || (rest.length === 2 && YEAR_RE.test(rest[0]) && MONTH0_RE.test(rest[1]));
    case "reports":
      if (rest.length === 0) return true;
      if (rest.length < 2 || !YEAR_RE.test(rest[0]) || !MONTH0_RE.test(rest[1])) return false;
      return rest.length === 2 || (rest.length === 3 && REPORT_TABS.has(rest[2]));
    case "library":
      return rest.length === 0 || (rest.length === 1 && SLUG_RE.test(rest[0]));
    case "files":
      // /files, or /files/{scope}/{from}/{to} — scope is "all", a module slug
      // or comma-separated document ids (see engine/fileScope.ts).
      return rest.length === 0 || (rest.length === 3 && /^[a-z0-9,-]+$/.test(rest[0]) && ISO_DATE_RE.test(rest[1]) && ISO_DATE_RE.test(rest[2]));
    case "gap":
      // /gap (chooser), /gap/internal, /gap/external, /gap/complaint/{id}, /gap/{id}
      if (rest.length === 0) return true;
      if (rest.length === 2) return rest[0] === "complaint" && /^[a-zA-Z0-9_-]+$/.test(rest[1]);
      return rest.length === 1 && /^[a-zA-Z0-9_-]+$/.test(rest[0]);
    case "hr":
      // /hr (HR Records overview), /hr/{slug} (one HR format's page — data/seed/hrModule.ts),
      // /hr/master-data (HR Master Data, the employee master sheet — REQUIREMENTS §53)
      return rest.length === 0 || (rest.length === 1 && (rest[0] === HR_MASTER_SLUG || HR_PAGE_SLUGS.has(rest[0])));
    case "document":
      // /document/{id} — a log sheet's own page (pages/DocumentRecordsPage.tsx)
      return rest.length === 1 && SLUG_RE.test(rest[0]);
    case "record":
    case "soc":
    case "training":
      return rest.length === 0 || (rest.length === 1 && /^[a-zA-Z0-9_-]+$/.test(rest[0]));
    case "pest": {
      const [area, slug, year, month] = rest;
      if (area === "daily") return rest.length === 1 || (rest.length === 3 && YEAR_RE.test(slug) && MONTH0_RE.test(year));
      if (area === "service") return !!slug && PEST_SERVICE_SLUGS.has(slug) && (rest.length === 2 || (rest.length === 3 && YEAR_RE.test(year)));
      if (area === "trend") return !!slug && PEST_TREND_SLUGS.has(slug) && (rest.length === 2 || (rest.length === 3 && YEAR_RE.test(year)));
      void month;
      return false;
    }
    case "demo":
      // Demo Mode is not part of the product, so Mitra cannot be sent there
      // either — only on a server started with it (engine/features.ts, REQUIREMENTS §65).
      return rest.length === 0 && demoModeAvailable();
    default:
      return rest.length === 0 && SIMPLE_ROUTES.has(root);
  }
}

export function Link({
  to,
  children,
  className,
  title,
}: {
  to: string;
  children: React.ReactNode;
  className?: string;
  title?: string;
}) {
  const { navigate } = useRouter();
  return (
    <a
      href={`#${to}`}
      title={title}
      className={className}
      onClick={(e) => {
        e.preventDefault();
        navigate(to);
      }}
    >
      {children}
    </a>
  );
}
