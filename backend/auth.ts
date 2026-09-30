import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import crypto from "node:crypto";
import path from "node:path";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dataDir } from "./paths.ts";
import { plantTimeZone } from "./db.ts";
import { nextMidnight } from "../frontend/src/engine/workingHoursCore.ts";

export interface PublicUser {
  id: string;
  name: string;
  email: string;
  role: "admin" | "staff";
  /**
   * The department codes this account may see (F/SYS/02's own codes — QC, PRD,
   * HR, MKT, ...). EMPTY means every department: management, the MR and QA
   * work across all of them, and so does an account nobody has assigned yet.
   * See frontend/src/engine/departmentScope.ts.
   */
  departments: string[];
}

// A signing secret is required to issue trustworthy session tokens. Rather
// than shipping a hardcoded default (insecure) or hard-requiring an env var
// (friction for an internal pilot with no ops team), generate one on first
// run and persist it next to the database — every restart reuses the same
// secret, so existing sessions keep working. Set JWT_SECRET yourself for a
// multi-instance / load-balanced deployment.
const secretPath = path.join(dataDir, "jwt-secret.txt");

function loadOrCreateSecret(): string {
  if (existsSync(secretPath)) return readFileSync(secretPath, "utf-8").trim();
  const secret = crypto.randomBytes(48).toString("hex");
  writeFileSync(secretPath, secret, "utf-8");
  return secret;
}

export const JWT_SECRET: string = process.env.JWT_SECRET || loadOrCreateSecret();
export const COOKIE_NAME = "dcrs_session";

// A DAY'S SESSION (REQUIREMENTS §84, C3). A session ends at the close of the day
// it was started — END of that working day for an account held to the plant's
// hours, the factory's midnight for the super admin (backend/workingHours.ts
// works out which) — so every morning starts with signing in. The end is the
// token's own `exp`, and the cookie is given the same lifetime.
//
// `v` marks a token made under that rule. Every token made before it (they
// lasted seven days) is refused, so nobody carries a session over from the week
// before the rule came in.
const SESSION_VERSION = 2;

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

/**
 * A session token for this account, good until `endsAt`. Left out, the session
 * ends at the factory's next midnight — the latest any day's session may run.
 */
export function signSessionToken(user: PublicUser, endsAt?: Date): string {
  const end = endsAt && Number.isFinite(endsAt.getTime()) ? endsAt : nextMidnight(new Date(), plantTimeZone());
  return jwt.sign({ sub: user.id, email: user.email, role: user.role, v: SESSION_VERSION, exp: Math.floor(end.getTime() / 1000) }, JWT_SECRET);
}

/**
 * The account a token names and when its session ends; null for a token this
 * server did not sign, one made before sessions ended with their day, or one
 * whose day has closed. `ignoreExpiration` reads a closed session too — only
 * for writing the "Signed out" line of a session the browser ends a moment
 * after its close (backend/index.ts, POST /api/auth/logout).
 */
export function verifySessionToken(token: string, opts: { ignoreExpiration?: boolean } = {}): { sub: string; endsAt: Date } | null {
  try {
    const payload = jwt.verify(token, JWT_SECRET, { ignoreExpiration: opts.ignoreExpiration === true });
    if (typeof payload === "string" || typeof payload.sub !== "string" || payload.v !== SESSION_VERSION || typeof payload.exp !== "number") return null;
    return { sub: payload.sub, endsAt: new Date(payload.exp * 1000) };
  } catch {
    return null;
  }
}
