// THE INDEX IS THE SUPER ADMIN'S, ON THE SERVER: a staff account's write of the "indexing" item is refused whatever it
// sends; the super admin's is stored; everybody can read it (their browsers need the formulas).
// Run: node --no-warnings=ExperimentalWarning --test indexing/tests/indexingStorage.test.ts
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import { after, before, describe, it } from "node:test";
import express, { type NextFunction, type Request, type Response } from "express";
import type { PublicUser } from "../../backend/auth.ts";
import type { StoredItem, StoredItems, WriteResult } from "../../backend/db.ts";
import { registerStorageRoutes, type StorageStore } from "../../backend/storageRoutes.ts";
import { DOCS_JSON } from "../../backend/tests/accessFixtures.ts";

class MemoryStore implements StorageStore {
  items = new Map<string, { value: string; version: number; seq: number }>();
  seq = 0;
  put(key: string, value: string): void {
    const now = this.items.get(key);
    this.items.set(key, { value, version: (now?.version ?? 0) + 1, seq: ++this.seq });
  }
  async storedItems(_userId: string, sinceSeq: number): Promise<StoredItems> {
    const items: StoredItems["items"] = [];
    const versions: Record<string, number> = {};
    for (const [key, v] of this.items) {
      versions[key] = v.version;
      if (v.seq > sinceSeq) items.push({ scope: "company", key, value: v.value, version: v.version, seq: v.seq });
    }
    return { items, seq: this.seq, versions };
  }
  async readItem(_scope: string, key: string): Promise<StoredItem | null> {
    const v = this.items.get(key);
    return v ? { key, ...v } : null;
  }
  async writeItem(_scope: string, key: string, value: string, _base: number | null, _by: string, compose?: (stored: string | null) => string): Promise<WriteResult> {
    const now = this.items.get(key);
    this.put(key, compose ? compose(now ? now.value : null) : value);
    const w = this.items.get(key)!;
    return { ok: true, version: w.version, seq: w.seq };
  }
  async deleteItem(_scope: string, key: string): Promise<void> {
    this.items.delete(key);
  }
  async itemSeq(_scope: string, key: string): Promise<number | null> {
    return this.items.get(key)?.seq ?? null;
  }
}

const USERS: Record<string, PublicUser> = {
  admin: { id: "u-admin", name: "Super Admin", email: "admin@gpp.local", role: "admin", departments: [] },
  kapila: { id: "u-kapila", name: "Kapila Barad", email: "kapila.barad@gpp.local", role: "staff", departments: ["QC"] },
};

describe("the indexing item on the server", () => {
  const store = new MemoryStore();
  let base = "";
  let server: ReturnType<ReturnType<typeof express>["listen"]>;
  before(async () => {
    store.put("documents", DOCS_JSON);
    const app = express();
    const requireAuth = (req: Request, res: Response, next: NextFunction) => {
      const u = USERS[String(req.get("x-test-user"))];
      if (!u) return void res.status(401).end();
      (req as Request & { user: PublicUser }).user = u;
      next();
    };
    registerStorageRoutes(app, { requireAuth, logActivity: () => undefined, store });
    await new Promise<void>((resolve) => {
      server = app.listen(0, () => resolve());
    });
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  after(() => server.close());

  const put = (who: string, body: unknown) =>
    fetch(`${base}/api/storage/indexing`, { method: "PUT", body: JSON.stringify(body), headers: { "x-test-user": who, "X-Account": USERS[who].id, "content-type": "text/plain" } });

  it("refuses a staff account's write", async () => {
    const res = await put("kapila", { schema: 1, current: {}, versions: [], formulas: { "sys07.sum": [{ expr: "0", since: "2026-01-01" }] } });
    assert.equal(res.status, 403);
    assert.equal(store.items.has("indexing"), false);
  });

  it("stores the super admin's, and everybody reads it", async () => {
    const res = await put("admin", { schema: 1, current: {}, versions: [], formulas: {} });
    assert.equal(res.status, 200, await res.text());
    assert.ok(store.items.has("indexing"));
    const read = await fetch(`${base}/api/storage`, { headers: { "x-test-user": "kapila", "X-Account": USERS.kapila.id } });
    assert.equal(read.status, 200);
    const body = (await read.json()) as { items: { key: string }[] };
    assert.ok(body.items.some((i) => i.key === "indexing"), "staff browsers get the index (for the formulas)");
  });
});
