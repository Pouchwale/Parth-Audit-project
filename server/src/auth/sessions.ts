import { and, eq, gt, isNull } from 'drizzle-orm';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { CurrentUser, Role } from '@shared/api.ts';
import type { AppDeps } from '../app.ts';
import type { Config } from '../config.ts';
import { ConnectorError, systemSignOutWords } from '../connectors/types.ts';
import { connectorCredentials, sessions, users } from '../db/schema.ts';
import { clientIp, HttpError } from '../http.ts';
import { hashToken, unseal } from './crypto.ts';

export type SessionRow = typeof sessions.$inferSelect;
export type UserRow = typeof users.$inferSelect;

export interface AuthContext {
  session: SessionRow;
  user: UserRow;
  role: Role;
}

declare module 'fastify' {
  interface FastifyRequest {
    auth: AuthContext | null;
  }
}

/**
 * A super admin of this app: the connected system's own administrator as it said at the person's last sign-in (DCRS's
 * super admin), or anybody SUPER_ADMINS lists.
 */
export function roleOf(config: Config, user: Pick<UserRow, 'username' | 'systemAdmin'>): Role {
  return user.systemAdmin || config.superAdmins.has(user.username.toLowerCase()) ? 'super_admin' : 'user';
}

export function currentUser(config: Config, user: UserRow): CurrentUser {
  return { id: user.id, username: user.username, displayName: user.displayName, role: roleOf(config, user) };
}

export function activeSession(now: Date) {
  return and(isNull(sessions.endedAt), gt(sessions.expiresAt, now));
}

const LAST_SEEN_RESOLUTION_MS = 60_000;

/** When each session's sign-in with the connected system was last found good: in memory, so a restart asks again. */
const upstreamChecked = new Map<string, number>();

/**
 * SIGNED OUT IN THE CONNECTED SYSTEM, SIGNED OUT HERE (DCRS REQUIREMENTS §106): a phone DCRS's super admin signed out
 * is signed out of Mitra at its next request, saying so in DCRS's own words. The system is asked at most once every
 * config.upstreamCheckMs per session (a sign-in counts as asked); a request that reaches DCRS anyway finds out there
 * too (phone/routes.ts, agent/agent.ts). The system out of reach, or outside its hours, is not a sign-out.
 */
async function checkUpstream(deps: AppDeps, request: FastifyRequest, session: SessionRow, now: Date): Promise<void> {
  const connector = deps.registry.signIn;
  if (!connector.checkSignIn) return;
  const last = upstreamChecked.get(session.id) ?? session.createdAt.getTime();
  if (now.getTime() - last < deps.config.upstreamCheckMs) return;
  const credentials = await loadCredentials(deps, session.id, connector.id);
  if (credentials === undefined) return;
  const said = request.headers['x-language'];
  const language = (Array.isArray(said) ? said[0] : said) ?? '';
  try {
    await connector.checkSignIn(credentials, language === 'en' || language === 'hi' || language === 'gu' ? { language } : {});
    if (upstreamChecked.size > 20_000) upstreamChecked.clear();
    upstreamChecked.set(session.id, now.getTime());
  } catch (error) {
    if (!(error instanceof ConnectorError) || error.kind !== 'unauthorized') return;
    upstreamChecked.delete(session.id);
    await endSession(deps, session.id, 'upstream_signed_out', request.log);
    throw signedOutUpstream(connector.name, systemSignOutWords(error));
  }
}

/**
 * The answer to a request whose sign-in the connected system no longer takes: in the system's own words when it gave
 * some (code session_ended: DCRS's super admin signed the device out), else that the sign-in has expired.
 */
export function signedOutUpstream(systemName: string, words?: string): HttpError {
  return words ? new HttpError(401, 'session_ended', words) : new HttpError(401, 'session_expired', `Your ${systemName} sign-in has expired. Sign in again.`);
}

/** preHandler that requires a valid session token and records when and where the device was last seen. */
export function requireSession(deps: AppDeps) {
  return async (request: FastifyRequest) => {
    const header = request.headers.authorization;
    const token = header?.startsWith('Bearer ') ? header.slice('Bearer '.length).trim() : '';
    if (!token) throw new HttpError(401, 'unauthenticated', 'Sign in to continue.');

    const now = new Date();
    const [row] = await deps.db
      .select({ session: sessions, user: users })
      .from(sessions)
      .innerJoin(users, eq(users.id, sessions.userId))
      .where(and(eq(sessions.tokenHash, hashToken(token)), activeSession(now)))
      .limit(1);
    if (!row) throw new HttpError(401, 'session_expired', 'Your session has ended. Sign in again.');

    await checkUpstream(deps, request, row.session, now);

    const ip = clientIp(request);
    if (now.getTime() - row.session.lastSeenAt.getTime() > LAST_SEEN_RESOLUTION_MS || row.session.lastIp !== ip) {
      await deps.db.update(sessions).set({ lastSeenAt: now, lastIp: ip }).where(eq(sessions.id, row.session.id));
      row.session.lastSeenAt = now;
      row.session.lastIp = ip;
    }
    request.auth = { ...row, role: roleOf(deps.config, row.user) };
  };
}

export async function requireSuperAdmin(request: FastifyRequest, _reply: FastifyReply) {
  if (request.auth?.role !== 'super_admin') throw new HttpError(403, 'forbidden', 'Only super admins can see this.');
}

export function authOf(request: FastifyRequest): AuthContext {
  if (!request.auth) throw new Error('Route is missing the requireSession preHandler');
  return request.auth;
}

/** The decrypted connector credentials behind a session, or undefined if there are none. */
export async function loadCredentials(deps: AppDeps, sessionId: string, connectorId: string): Promise<unknown> {
  const [row] = await deps.db
    .select()
    .from(connectorCredentials)
    .where(and(eq(connectorCredentials.sessionId, sessionId), eq(connectorCredentials.connectorId, connectorId)));
  return row ? unseal(deps.config.credentialsKey, row.sealed) : undefined;
}

/** Ends a session, drops its stored connector credentials and signs out of those systems (best effort). */
export async function endSession(
  deps: AppDeps,
  sessionId: string,
  reason: NonNullable<SessionRow['endReason']>,
  log?: FastifyRequest['log'],
): Promise<boolean> {
  const ended = await deps.db
    .update(sessions)
    .set({ endedAt: new Date(), endReason: reason })
    .where(and(eq(sessions.id, sessionId), isNull(sessions.endedAt)))
    .returning({ id: sessions.id });
  if (ended.length === 0) return false;

  const stored = await deps.db.delete(connectorCredentials).where(eq(connectorCredentials.sessionId, sessionId)).returning();
  for (const row of stored) {
    const connector = deps.registry.connectors.find((c) => c.id === row.connectorId);
    if (!connector?.signOut || reason === 'upstream_signed_out') continue;
    connector.signOut(unseal(deps.config.credentialsKey, row.sealed)).catch((err: unknown) => {
      log?.warn({ err, connector: connector.id }, 'connector sign-out failed');
    });
  }
  return true;
}
