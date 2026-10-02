import React, { useEffect, useRef, useState } from "react";

// THE BOX A NAME OR A HEADER VALUE IS TYPED OVER IN, where it stands
// (REQUIREMENTS §64, §77, §86). Shared by the Sheet Designer — a column's
// heading, a box's label, the format's name and its header — and by a record
// page's header block. Enter keeps what was typed, Escape puts it back, and
// leaving the box keeps it too, as it does everywhere a name is typed.

/**
 * A name being typed where it stands. It arrives focused with the old name
 * selected, so typing replaces it. Enter — or clicking anywhere else — keeps
 * what was typed; Escape leaves the name as it was. The instructions take
 * several lines, so there Enter is a new line and Ctrl+Enter keeps them.
 */
export function RenameBox({
  field,
  label,
  initial,
  multiline,
  inputType,
  onCommit,
  onCancel,
}: {
  field: string;
  label: string;
  initial: string;
  multiline?: boolean;
  /** "date" for the header's revision date (REQUIREMENTS §77); text otherwise. */
  inputType?: string;
  onCommit: (value: string) => void;
  onCancel: () => void;
}) {
  const [text, setText] = useState(initial);
  const line = useRef<HTMLInputElement>(null);
  const area = useRef<HTMLTextAreaElement>(null);
  // Enter takes the box off the sheet, and the blur that follows must not keep the name a second time.
  const done = useRef(false);
  useEffect(() => {
    const el = line.current ?? area.current;
    el?.focus();
    el?.select();
  }, []);
  const finish = (keep: boolean) => {
    if (done.current) return;
    done.current = true;
    if (keep) onCommit(text);
    else onCancel();
  };
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && (!multiline || e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      finish(true);
    } else if (e.key === "Escape") {
      // The Escape is this box's: a menu or a pop-up underneath is not to close on it as well.
      e.stopPropagation();
      finish(false);
    }
  };
  return multiline ? (
    <textarea
      ref={area}
      className="input designer-rename notranslate"
      translate="no"
      rows={Math.min(10, Math.max(3, text.split("\n").length + 1))}
      value={text}
      aria-label={label}
      data-field={field}
      onChange={(e) => setText(e.target.value)}
      onKeyDown={onKeyDown}
      onBlur={() => finish(true)}
    />
  ) : (
    <input
      ref={line}
      type={inputType ?? "text"}
      className="input input-sm designer-rename notranslate"
      translate="no"
      value={text}
      aria-label={label}
      data-field={field}
      onChange={(e) => setText(e.target.value)}
      onKeyDown={onKeyDown}
      onBlur={() => finish(true)}
    />
  );
}
