import React, { useState } from "react";

// EVERY PRINTED WORD OF A SHEET IS THE PERSON'S TO TYPE OVER (REQUIREMENTS §135; the owner, 28-Oct-2026: "each and every
// document of HR and QC in that each and every single part make sure it is always editable every single part of it").
//
// A line's printed words - a parameter, a specification, a check point's question, the PROCEDURE under the grid - stay
// drawn exactly as the paper draws them (its bold headings, its lines, its underlines), so nothing changes in print; while
// the record can be written on, a click puts the caret in them, and what is typed becomes THIS record's own words for that
// place. The format, and every other record, keep theirs (Edit format changes the format for every new sheet). Kept when
// the words are left (they are typed in place, so nothing is redrawn under the caret); Escape puts them back as they were.
// The element is drawn afresh after a change (its key), so the words the browser typed into are never the ones React
// keeps.

/** The words as they stand in the element: its lines, without the browser's last line break. */
function wordsIn(el: HTMLElement): string {
  return el.innerText.replace(/\r/g, "").replace(/\n+$/, "");
}

export function EditableWords({
  shown,
  editable,
  onChange,
  className,
  style,
  label,
  children,
}: {
  /** The words drawn now, as the person reads them (the record's own, or the paper's in the chosen language). */
  shown: string;
  /** False on a record that cannot be written on: the words as plain text, as before. */
  editable: boolean;
  onChange: (words: string) => void;
  className?: string;
  style?: React.CSSProperties;
  /** What these words are, for a screen reader. */
  label?: string;
  children: React.ReactNode;
}) {
  const [round, setRound] = useState(0);
  // (exactly the markup it had before: its own span where it had one, the words alone where they stood in their line)
  if (!editable) {
    return className || style ? (
      <span className={className} style={style}>
        {children}
      </span>
    ) : (
      <>{children}</>
    );
  }
  return (
    <span
      key={`${round}|${shown}`}
      className={className ? `${className} editable-words` : "editable-words"}
      style={style}
      contentEditable
      suppressContentEditableWarning
      role="textbox"
      aria-multiline="true"
      aria-label={label ? `${label} (the printed words, yours to change on this record)` : "The printed words, yours to change on this record"}
      spellCheck={false}
      data-editable-words=""
      onBlur={(e) => {
        const next = wordsIn(e.currentTarget);
        if (next.trim() !== shown.trim()) onChange(next);
        // Drawn afresh either way: the browser's own edits never stay under React's feet.
        setRound((r) => r + 1);
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          setRound((r) => r + 1);
        }
      }}
    >
      {children}
    </span>
  );
}
