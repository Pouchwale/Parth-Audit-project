// THE ACCESS RULES AS STORED, READ ONCE PER CHANGE (REQUIREMENTS §96).
//
// Every route that decides what a person may see or do asks the same thing: the plant's catalogue (the company item
// "documents") and the super admin's rules (the company item "access", backend/accessLevels.ts ACCESS_KEY), built into
// one AccessCatalogue. Both items are read again only when their seq has moved (each write moves it), so asking costs
// two small queries; the server's own database by default, a test's stand-in otherwise.
import type { StoredItem } from "./db.ts";
import { database, readItem } from "./db.ts";
import type { PublicUser } from "./auth.ts";
import { ACCESS_KEY, accessCatalogue, viewFor, type AccessCatalogue, type AccessView } from "./accessLevels.ts";

/** Where the two items are read. */
export interface AccessItemSource {
  itemSeq(scope: string, key: string): Promise<number | null>;
  readItem(scope: string, key: string): Promise<StoredItem | null>;
}

export const databaseItemSource: AccessItemSource = {
  async itemSeq(scope, key) {
    const { rows } = await database().query<{ seq: string }>("SELECT seq::text AS seq FROM app_storage WHERE scope = $1 AND key = $2", [scope, key]);
    return rows[0] ? Number(rows[0].seq) : null;
  },
  readItem,
};

/** A loader of the catalogue and the rules over one source, built again only when one of the two items changed. */
export function catalogueLoader(source: AccessItemSource = databaseItemSource): () => Promise<AccessCatalogue> {
  let cached: { key: string; catalogue: AccessCatalogue } | null = null;
  return async () => {
    const [docsSeq, accessSeq] = await Promise.all([source.itemSeq("company", "documents"), source.itemSeq("company", ACCESS_KEY)]);
    const key = `${docsSeq ?? 0}|${accessSeq ?? 0}`;
    if (cached && cached.key === key) return cached.catalogue;
    const [docs, rules] = await Promise.all([docsSeq === null ? null : source.readItem("company", "documents"), accessSeq === null ? null : source.readItem("company", ACCESS_KEY)]);
    const catalogue = accessCatalogue(docs?.value ?? null, rules?.value ?? null);
    cached = { key, catalogue };
    return catalogue;
  };
}

/** The account as the rules read it. */
export const accessAccountOf = (user: Pick<PublicUser, "email" | "role" | "departments">) => ({ email: user.email, role: user.role, departments: user.departments });

let shared: (() => Promise<AccessCatalogue>) | null = null;

/** The server's own loader (one cache for every route). */
export function sharedCatalogue(): Promise<AccessCatalogue> {
  shared ??= catalogueLoader();
  return shared();
}

/** What this person may see and do now, by the server's own database. */
export async function accessViewOf(user: Pick<PublicUser, "email" | "role" | "departments">, load: () => Promise<AccessCatalogue> = sharedCatalogue): Promise<AccessView> {
  return viewFor(await load(), accessAccountOf(user));
}
