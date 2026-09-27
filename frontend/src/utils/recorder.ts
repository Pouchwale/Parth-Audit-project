// THE MICROPHONE, RECORDED FOR WHISPER (REQUIREMENTS §80).
//
// utils/speech.ts listens with the browser's own SpeechRecognition, which
// hears English well and Gujarati badly. When the server has a key, Mitra
// records the voice instead — MediaRecorder, the browser's own — and sends the
// clip to POST /api/assistant/transcribe, where Groq Whisper reads English,
// Gujarati and the mix the plant speaks. The interface chooses between the two
// (SPEC "Voice"); this module only records.
//
// A recording is at most 90 seconds — an instruction, not a speech — and
// stops itself at that. The microphone is released the moment it stops or is
// cancelled, never left open behind a closed panel.

export type RecorderErrorKind = "denied" | "unsupported" | "other";

/** Why a recording could not start, as a kind the interface can word (`ai.voiceDenied`, `ai.voiceUnsupported`, `ai.voiceError`). */
export class RecorderError extends Error {
  kind: RecorderErrorKind;
  constructor(kind: RecorderErrorKind, message?: string) {
    super(message ?? kind);
    this.name = "RecorderError";
    this.kind = kind;
  }
}

/** The kind of a failure to record, from whatever was thrown. */
export function recorderErrorKind(err: unknown): RecorderErrorKind {
  if (err instanceof RecorderError) return err.kind;
  const name = (err as { name?: unknown } | null | undefined)?.name;
  if (name === "NotAllowedError" || name === "PermissionDeniedError" || name === "SecurityError") return "denied";
  if (name === "NotSupportedError" || name === "TypeError") return "unsupported";
  return "other";
}

export interface Recording {
  /** Stops recording, releases the microphone and gives the clip. Safe to call after the automatic stop. */
  stop: () => Promise<Blob>;
  /** Drops the recording and releases the microphone; nothing is delivered. */
  cancel: () => void;
  /** The clip's mime type, for the `x-mime` header. */
  mime: string;
}

export interface RecordingOptions {
  /** Called once a second with the seconds recorded so far. */
  onSeconds?: (seconds: number) => void;
  /** The recording stops itself after this many seconds (90). */
  maxSeconds?: number;
  /** Called with the clip when the recording stopped itself at `maxSeconds`. */
  onAutoStop?: (blob: Blob) => void;
}

const PREFERRED_MIMES = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"];
export const MAX_RECORDING_SECONDS = 90;

type RecorderCtor = typeof MediaRecorder;

function recorderCtor(): RecorderCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { MediaRecorder?: RecorderCtor };
  return typeof w.MediaRecorder === "function" ? w.MediaRecorder : null;
}

/** Whether this browser can record the microphone at all (MediaRecorder + getUserMedia). */
export function isRecorderSupported(): boolean {
  return recorderCtor() !== null && typeof navigator !== "undefined" && !!navigator.mediaDevices && typeof navigator.mediaDevices.getUserMedia === "function";
}

/** The first mime type this browser records in: WebM/Opus (Chrome, Edge, Firefox), else WebM, else MP4 (Safari). */
export function preferredMime(): string | null {
  const Ctor = recorderCtor();
  if (!Ctor) return null;
  const supported = (Ctor as unknown as { isTypeSupported?: (m: string) => boolean }).isTypeSupported;
  if (typeof supported !== "function") return PREFERRED_MIMES[0];
  return PREFERRED_MIMES.find((m) => supported.call(Ctor, m)) ?? null;
}

/**
 * Starts recording the microphone. Rejects with a RecorderError — "denied"
 * when the person refused the microphone, "unsupported" where the browser
 * cannot record, "other" for the rest (no microphone, a device in use).
 */
export async function startRecording({ onSeconds, maxSeconds = MAX_RECORDING_SECONDS, onAutoStop }: RecordingOptions = {}): Promise<Recording> {
  const Ctor = recorderCtor();
  if (!Ctor || !isRecorderSupported()) throw new RecorderError("unsupported", "This browser cannot record the microphone");
  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch (err) {
    throw new RecorderError(recorderErrorKind(err) === "denied" ? "denied" : "other", err instanceof Error ? err.message : String(err));
  }
  const mime = preferredMime();
  let recorder: MediaRecorder;
  try {
    recorder = mime ? new Ctor(stream, { mimeType: mime }) : new Ctor(stream);
  } catch (err) {
    stream.getTracks().forEach((track) => track.stop());
    throw new RecorderError("unsupported", err instanceof Error ? err.message : String(err));
  }
  const chunks: BlobPart[] = [];
  const actualMime = recorder.mimeType || mime || "audio/webm";
  let seconds = 0;
  let finished = false;
  let cancelled = false;
  let ticker: ReturnType<typeof setInterval> | null = null;

  const release = (): void => {
    if (ticker !== null) {
      clearInterval(ticker);
      ticker = null;
    }
    stream.getTracks().forEach((track) => track.stop());
  };

  const done = new Promise<Blob>((resolve) => {
    recorder.ondataavailable = (e: BlobEvent) => {
      if (e.data && e.data.size > 0 && !cancelled) chunks.push(e.data);
    };
    recorder.onstop = () => {
      finished = true;
      release();
      resolve(new Blob(cancelled ? [] : chunks, { type: actualMime }));
    };
    recorder.onerror = () => {
      finished = true;
      release();
      resolve(new Blob(cancelled ? [] : chunks, { type: actualMime }));
    };
  });

  const stopNow = (): void => {
    if (finished) return;
    try {
      if (recorder.state !== "inactive") recorder.stop();
      else {
        finished = true;
        release();
      }
    } catch {
      finished = true;
      release();
    }
  };

  ticker = setInterval(() => {
    seconds += 1;
    onSeconds?.(seconds);
    if (seconds >= maxSeconds) {
      stopNow();
      if (onAutoStop) void done.then((blob) => onAutoStop(blob));
    }
  }, 1000);

  // A chunk every second, so a browser that misses the final flush still has the clip.
  recorder.start(1000);
  onSeconds?.(0);

  return {
    mime: actualMime,
    stop: () => {
      stopNow();
      return done;
    },
    cancel: () => {
      cancelled = true;
      chunks.length = 0;
      stopNow();
    },
  };
}
