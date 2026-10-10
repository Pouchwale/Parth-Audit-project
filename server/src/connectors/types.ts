import type { z } from 'zod';
import type { DeviceInfo, FileInfo } from '@shared/api.ts';

/**
 * A connector is one external system the assistant can act on, described as a small, explicit
 * list of actions. The assistant can do nothing else with that system.
 */
export interface Connector {
  /** Stable id used in tool names, logs and stored credentials, e.g. "dcrs". Lowercase letters, digits, underscores. */
  id: string;
  /** Name people see, e.g. "Digital Controlled Record System". */
  name: string;
  /** One or two sentences telling the assistant what this system holds and when to use it. */
  description: string;
  actions: readonly Action[];
  /** Two to four short requests people can try, shown on the app's welcome screen. */
  examples?: readonly string[];
  /**
   * Words people say about this system that a voice recording's text must spell as written here, such as its short
   * name and its kind of format numbers ("DCRS", "F/QC/30"). Whisper is shown them (voice/transcriber.ts).
   */
  spokenTerms?: readonly string[];
  /**
   * Checks a person's username and password with this system and returns their account and credentials. `context`
   * says which phone is signing in, from where and in which language, so the system can name the device and answer in
   * the person's words (DCRS: its list of who is signed in where, and its limit of devices per account).
   */
  authenticate(username: string, password: string, context?: SignInContext): Promise<ConnectorAccount>;
  /**
   * Asks the system whether a stored sign-in still works. Throws an 'unauthorized' ConnectorError, in the system's own
   * words where it gave some, when it does not (DCRS: a device its super admin signed out). Anything else, such as the
   * system being out of reach, is not a sign-out and throws nothing.
   */
  checkSignIn?(credentials: unknown, options?: RelayOptions): Promise<void>;
  /** Best-effort sign-out with the system when a session ends. */
  signOut?(credentials: unknown): Promise<void>;
  /**
   * What the app's own screens ask of the system as the person, outside the chat: the inbox, the tasks and the Review
   * screen (shared/api.ts). Only a system that keeps notifications offers it (DCRS); without it those routes say so.
   */
  phone?: PhoneRelay;
}

/** Who is signing in, beyond the username and password (Connector.authenticate). */
export interface SignInContext {
  /** The phone, as the app said it at sign-in. */
  device?: DeviceInfo;
  /** The phone's address, as this server saw it. */
  address?: string;
  /** The language the app is read in: the system's refusal comes in it. */
  language?: 'en' | 'hi' | 'gu';
  /** The credentials of this phone's earlier sign-in still kept, so the system replaces that session rather than counting a second. */
  previous?: unknown;
}

export type RelayQuery = Record<string, string | number | undefined>;

/** How the person asked: the language the app is read in, so the system's words (a refusal, a reason) come in it. */
export interface RelayOptions {
  language?: 'en' | 'hi' | 'gu';
}

/**
 * Relays the phone's screens to the system as the signed-in person. Each call answers the system's own JSON, or throws
 * a ConnectorError in the system's words. The server keeps no notification or task logic of its own.
 */
export interface PhoneRelay {
  notifications(credentials: unknown, query: RelayQuery, options?: RelayOptions): Promise<unknown>;
  markRead(credentials: unknown, body: { ids?: number[]; all?: true }, options?: RelayOptions): Promise<unknown>;
  testNotification(credentials: unknown, options?: RelayOptions): Promise<unknown>;
  preferences(credentials: unknown, options?: RelayOptions): Promise<unknown>;
  savePreferences(credentials: unknown, body: unknown, options?: RelayOptions): Promise<unknown>;
  registerDevice(credentials: unknown, body: unknown, options?: RelayOptions): Promise<unknown>;
  removeDevice(credentials: unknown, body: { token: string }, options?: RelayOptions): Promise<unknown>;
  tasks(credentials: unknown, options?: RelayOptions): Promise<unknown>;
  startRecord(credentials: unknown, body: { documentId: string; date?: string }, options?: RelayOptions): Promise<unknown>;
  record(credentials: unknown, recordId: string, options?: RelayOptions): Promise<unknown>;
  changeRecord(credentials: unknown, recordId: string, body: { patch: Record<string, unknown>; note?: string }, options?: RelayOptions): Promise<unknown>;
  actOnRecord(credentials: unknown, recordId: string, body: { action: string; reason?: string; reviewed?: boolean }, options?: RelayOptions): Promise<unknown>;
}

export interface ConnectorAccount {
  /** The system's own stable id for this person. */
  externalId: string;
  username: string;
  displayName: string;
  /** Whatever the connector needs to call the system as this person (token, cookie...). Stored encrypted. */
  credentials: unknown;
  /** When the credentials stop working, if the system says. */
  expiresAt?: Date | null;
  /**
   * The system itself says this person is its administrator (DCRS's super admin, role "admin" in its own answer at
   * this sign-in). Such a person is this app's super admin too, beside SUPER_ADMINS. Read again at every sign-in, so a
   * role taken away in the system stops counting at the person's next sign-in.
   */
  systemAdmin?: boolean;
}

/** read: runs straight away. write: changes data, so the person always confirms it first. */
export type ActionKind = 'read' | 'write';

export interface Action<Input = any> {
  /** snake_case, unique within the connector. */
  name: string;
  /** Tells the assistant what this does and when to use it. */
  description: string;
  kind: ActionKind;
  /** Must be a z.object(). Validated on the server before anything runs. */
  input: z.ZodType<Input>;
  /**
   * One plain sentence saying exactly what this call does, e.g. "Close finding F-102 as resolved".
   * Shown on the confirmation card and in the admin action log, so it must come from the input, not the model.
   * It may ask the system what the input names, such as the document behind a format number, and answer the
   * sentence with the input as resolved: that input is then what is logged, confirmed and run.
   * Throwing a ConnectorError, such as for a file that isn't in the conversation or a name that fits several
   * documents, turns the call down, and the assistant is told why.
   */
  describe(input: Input, ctx: DescribeContext): string | Described<Input> | Promise<string | Described<Input>>;
  /**
   * Calls the system. The result goes back to the assistant as JSON, so keep it small and relevant. To hand the
   * person files, such as a report, return withFiles(result, files).
   */
  run(ctx: ActionContext, input: Input): Promise<unknown>;
}

export interface ActionContext {
  /** The credentials this connector returned from authenticate() for the signed-in person. */
  credentials: unknown;
  files: ConversationFiles;
}

/** What describe() has to work with: the same as run(), since naming a call exactly can mean asking the system. */
export type DescribeContext = ActionContext;

/** A call's sentence, with its input as the action resolved it (a document's id in place of its number, say). */
export interface Described<Input> {
  summary: string;
  input: Input;
}

/** The files in the conversation the action runs in: ones the person attached, and ones systems returned. */
export interface ConversationFiles {
  /** Throws a not_found ConnectorError for any file that isn't the person's own in this conversation. */
  get(fileId: string): Promise<{ info: FileInfo; data: Uint8Array }>;
}

/** A file an action hands the person, such as a report. They can open, download and share it. */
export interface ActionFile {
  filename: string;
  mimeType: string;
  data: Uint8Array;
  /** What it is, for the assistant, e.g. "Daily pest control report for Main Plant, 26 September 2026". */
  description?: string;
}

// A class rather than a plain object, so no ordinary result can be mistaken for one with files.
class ResultWithFiles {
  readonly result: unknown;
  readonly files: readonly ActionFile[];

  constructor(result: unknown, files: readonly ActionFile[]) {
    this.result = result;
    this.files = files;
  }
}

/** An action result that also hands the person files. */
export function withFiles(result: unknown, files: readonly ActionFile[]): unknown {
  return new ResultWithFiles(result, files);
}

/** An action's result and the files it hands over, if any. */
export function splitResult(output: unknown): { result: unknown; files: readonly ActionFile[] } {
  return output instanceof ResultWithFiles ? { result: output.result, files: output.files } : { result: output, files: [] };
}

/** Declares an action with its input type inferred from the zod schema. */
export function defineAction<Input>(action: Action<Input>): Action<Input> {
  return action;
}

export type ConnectorErrorKind =
  | 'invalid_credentials' // wrong username or password
  | 'unauthorized' // the stored sign-in no longer works
  | 'forbidden'
  | 'not_found'
  | 'invalid_request'
  | 'conflict'
  // The system asks the person to wait before doing that again (DCRS's 429, such as a second test push within 20 seconds).
  | 'too_many'
  | 'unavailable';

/** Thrown by connectors. The message must be safe and useful to show the person. */
export class ConnectorError extends Error {
  readonly kind: ConnectorErrorKind;
  /**
   * The system's own code for what happened, when it gave one and the message is its own words: DCRS's "device-limit"
   * (one device too many at sign-in) and "session-ended" (a device its super admin signed out).
   */
  readonly code: string | undefined;

  constructor(kind: ConnectorErrorKind, message: string, options: { code?: string } = {}) {
    super(message);
    this.name = 'ConnectorError';
    this.kind = kind;
    this.code = options.code;
  }
}

/**
 * The system's own words for why a stored sign-in stopped working, to show the person as they are (DCRS: "The super
 * admin signed this device out at 14:05. Sign in again to carry on."); undefined when it gave none.
 */
export function systemSignOutWords(error: unknown): string | undefined {
  return error instanceof ConnectorError && error.kind === 'unauthorized' && error.code ? error.message : undefined;
}
