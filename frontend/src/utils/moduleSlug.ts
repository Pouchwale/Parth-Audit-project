// Turns a DocumentDefinition.module name into a URL-safe slug for
// /library/{slug} deep links (used by the sidebar's module links and by the
// assistant's navigate action) — "Lamination — Quality Control" becomes
// "lamination-quality-control".
export function moduleSlug(module: string): string {
  return module
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// A RENAMED MODULE KEEPS ITS OLD ADDRESS (REQUIREMENTS §91). The Production
// module was the lamination production module until 06-Oct-2026, at
// /library/lamination-production: a bookmark, a link somebody sent, or an answer
// Mitra gave before the rename still opens the module, now at /library/production.
// Each line is an old slug and the slug it is now.
export const MOVED_MODULE_SLUGS: Readonly<Record<string, string>> = {
  "lamination-production": "production",
};

/** The slug a /library/{slug} or /files/{slug}/… address means today: a renamed module's old slug gives its new one. */
export function currentModuleSlug(slug: string): string;
export function currentModuleSlug(slug: string | undefined): string | undefined;
export function currentModuleSlug(slug: string | undefined): string | undefined {
  return slug === undefined ? undefined : (MOVED_MODULE_SLUGS[slug] ?? slug);
}

/** An address as it reads today: "/library/lamination-production" is "/library/production"; any other is itself. */
export function currentAddress(path: string): string {
  const m = /^\/(library|files)\/([^/]+)(.*)$/.exec(path);
  if (!m || !MOVED_MODULE_SLUGS[m[2]]) return path;
  return `/${m[1]}/${MOVED_MODULE_SLUGS[m[2]]}${m[3]}`;
}
