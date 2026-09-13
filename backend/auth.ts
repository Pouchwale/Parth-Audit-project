import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import crypto from "node:crypto";
import path from "node:path";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dataDir } from "./paths.ts";

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
export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function signSessionToken(user: PublicUser): string {
  return jwt.sign({ sub: user.id, email: user.email, role: user.role }, JWT_SECRET, {
    expiresIn: Math.floor(SESSION_TTL_MS / 1000),
  });
}

export function verifySessionToken(token: string): { sub: string } | null {
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    if (typeof payload === "string" || typeof payload.sub !== "string") return null;
    return { sub: payload.sub };
  } catch {
    return null;
  }
}
