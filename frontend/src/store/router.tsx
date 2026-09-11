import React, { createContext, useContext, useEffect, useState } from "react";

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
}

const RouterContext = createContext<RouterValue | null>(null);

export function RouterProvider({ children }: { children: React.ReactNode }) {
  const [path, setPath] = useState(currentPath());

  useEffect(() => {
    const onHashChange = () => setPath(currentPath());
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  const navigate = (next: string) => {
    window.location.hash = next.startsWith("/") ? next : `/${next}`;
  };

  const segments = path.split("/").filter(Boolean);

  return <RouterContext.Provider value={{ path, segments, navigate }}>{children}</RouterContext.Provider>;
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
// their own case (root, optional id), not as a zero-segment-only route.
const SIMPLE_ROUTES = new Set([
  "", "dashboard", "process-flow", "library", "calendar", "reports",
  "chemical-master", "sop", "master-data", "demo", "search", "pest-control", "assistant", "licence",
]);
const REPORT_TABS = new Set(["monthly", "daily", "rodent", "flycatcher", "chemical", "gap", "training", "lamination"]);
// Pest Control module pages (src/pages/PestControlPages.tsx):
// /pest/daily[/{year}/{month0}], /pest/service/{slug}[/{year}], /pest/trend/{slug}[/{year}]
const PEST_SERVICE_SLUGS = new Set(["rodent", "general", "fly"]);
const PEST_TREND_SLUGS = new Set(["rodent", "fly-catcher"]);
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
