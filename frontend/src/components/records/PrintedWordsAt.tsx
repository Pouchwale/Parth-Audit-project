import React from "react";
import type { PrintedWords } from "../../types";
import { EditableWords } from "./EditableWords";

// A PLACE A FORM PRINTS WORDS IN, TYPED OVER ON THE RECORD (REQUIREMENTS §137; the owner, 28-Oct-2026, with the
// contractor's service report: "make HR Module each and every part of all documents editable"). The forms of the HR
// module drawn by their own views - the service reports, F/HR/17's day, F/HR/18, the pest responsibilities, the service
// agreement - keep a record's own wording of their printed words by place (the record's `printedWords`): a place the
// record has not changed draws exactly what it drew before, markup and all, so the printout and every check that reads
// it are as they were; a place typed over draws the record's words, its lines as typed. The format, and every other
// record, keep the form's words.

/** The words a place shows: the record's own where it has them, else the form's. */
export function wordsAt(words: PrintedWords | undefined, place: string, original: string): string {
  const own = words?.[place];
  return own !== undefined ? own : original;
}

/** The record's words with one place typed over (an unchanged place is not stored). */
export function withWordsAt(words: PrintedWords | undefined, place: string, typed: string, original: string): PrintedWords {
  const next = { ...(words ?? {}) };
  if (typed.trim() === original.trim()) delete next[place];
  else next[place] = typed;
  return next;
}

/** A record's own lines: each line of the typed words, the browser's breaks kept. */
export function ownLines(text: string): React.ReactNode {
  return text.split("\n").map((line, i) => (
    <React.Fragment key={i}>
      {i > 0 && <br />}
      {line}
    </React.Fragment>
  ));
}

export function PrintedWordsAt({
  place,
  words,
  original,
  editable,
  onWords,
  className,
  style,
  label,
  children,
}: {
  /** Where on the form, e.g. "title", "area:3", "cp:7". */
  place: string;
  words: PrintedWords | undefined;
  /** The form's own words for the place, as a person reads them (their lines joined by "\n"). */
  original: string;
  editable: boolean;
  onWords: (next: PrintedWords) => void;
  className?: string;
  style?: React.CSSProperties;
  label?: string;
  /** How the form draws its own words (a line break, a muted part) - drawn while the record has not changed them. */
  children?: React.ReactNode;
}) {
  const own = words?.[place];
  const shown = own !== undefined ? own : original;
  return (
    <EditableWords
      shown={shown}
      editable={editable}
      onChange={(typed) => onWords(withWordsAt(words, place, typed, original))}
      className={className}
      style={style}
      label={label}
    >
      {own !== undefined ? ownLines(own) : (children ?? original)}
    </EditableWords>
  );
}
