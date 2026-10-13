import React from "react";

/**
 * THE PAPER'S OWN TEXT BELOW THE GRID, word for word (REQUIREMENTS §111): F/QC/11's and
 * F/QC/12's PROCEDURE. A heading the paper prints in capitals ("PROCEDURE:") is bold, the
 * rest reads as printed. Drawn by the record's sheet and by the format's designer alike.
 */
export function NotesBelow({ lines }: { lines: string[] }) {
  return (
    <div className="mt-3 sheet-notes-below" data-section="notes-below">
      {lines.map((line, i) => {
        const m = /^([A-Z][A-Z .&/()-]*:)(\s*)([\s\S]*)$/.exec(line);
        return (
          <p key={i} className={`text-sm${i < lines.length - 1 ? " mb-1" : ""}`} style={{ whiteSpace: "pre-wrap" }}>
            {m ? (
              <>
                <strong>{m[1]}</strong>
                {m[2]}
                {m[3]}
              </>
            ) : (
              line
            )}
          </p>
        );
      })}
    </div>
  );
}
