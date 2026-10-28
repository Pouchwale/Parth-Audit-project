import { EditableWords } from "./EditableWords";
import React from "react";

/**
 * THE PAPER'S OWN TEXT BELOW THE GRID, word for word (REQUIREMENTS §111): F/QC/11's and
 * F/QC/12's PROCEDURE. A heading the paper prints in capitals ("PROCEDURE:") is bold, and so
 * is a line printed all in capitals; the rest reads as printed. Drawn by the record's sheet
 * and by the format's designer alike — and, as `section` "notes-at-foot", for the text the
 * paper prints at the foot of the sheet after every box (the certificates' "THIS IS A SYSTEM
 * GENERATED DOCUMENT.").
 */
export function NotesBelow({
  lines,
  section = "notes-below",
  editable = false,
  onLine,
}: {
  lines: string[];
  /** Each line typed over on the record (REQUIREMENTS §135), while it can be written on. */
  editable?: boolean;
  onLine?: (index: number, words: string) => void;
  section?: "notes-below" | "notes-at-foot" }) {
  return (
    <div className="mt-3 sheet-notes-below" data-section={section}>
      {lines.map((line, i) => {
        const m = /^([A-Z][A-Z .&/()-]*:)(\s*)([\s\S]*)$/.exec(line);
        const capitals = /[A-Z]/.test(line) && line === line.toUpperCase();
        return (
          <p key={i} className={`text-sm${i < lines.length - 1 ? " mb-1" : ""}`} style={{ whiteSpace: "pre-wrap" }}>
            <EditableWords shown={line} editable={editable && !!onLine} onChange={(words) => onLine?.(i, words)} label="A line of the paper's text">
            {capitals ? (
              <strong>{line}</strong>
            ) : m ? (
              <>
                <strong>{m[1]}</strong>
                {m[2]}
                {m[3]}
              </>
            ) : (
              line
            )}
            </EditableWords>
          </p>
        );
      })}
    </div>
  );
}
