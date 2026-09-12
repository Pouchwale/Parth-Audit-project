import React from "react";

// One value on a letter-style controlled form (the Complaint Acknowledgement
// Report, the Responsibilities document). While the record is a draft it is an
// input box; on the printout — and on a record that is locked — it is the value
// as plain text, the way the paper reads, so nothing is ever cut off by the
// width of a box. Both are rendered and the stylesheet shows the right one
// (.caf-screen-only / .caf-print-only, styles.css).

/** 2026-07-11 -> "11.07.2026", as these forms write a date. */
export function formDate(iso: string): string {
  const [y, m, d] = (iso || "").split("-");
  return y && m && d ? `${d}.${m}.${y}` : "";
}

export type FieldKind = "text" | "date" | "long";

export function FormField({
  value,
  onChange,
  editable,
  kind = "text",
  field,
  placeholder,
  list,
  roomy,
}: {
  value: string;
  onChange: (v: string) => void;
  editable: boolean;
  kind?: FieldKind;
  field: string;
  placeholder?: string;
  list?: string;
  /** Leaves writing room on a printed blank form (root cause, the actions). */
  roomy?: boolean;
}) {
  const shown = kind === "date" ? formDate(value) : value;
  const cls = `caf-value${kind === "long" ? " long" : ""}${roomy ? " roomy" : ""}${editable ? " caf-print-only" : ""}`;
  const text = kind === "long" ? <div className={cls}>{shown}</div> : <span className={cls}>{shown}</span>;
  if (!editable) return text;
  return (
    <>
      {kind === "long" ? (
        <textarea
          className="input caf-input caf-long caf-screen-only"
          data-field={field}
          rows={3}
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      ) : (
        <input
          className="input caf-input caf-screen-only"
          data-field={field}
          type={kind === "date" ? "date" : "text"}
          list={list}
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
      {text}
    </>
  );
}
