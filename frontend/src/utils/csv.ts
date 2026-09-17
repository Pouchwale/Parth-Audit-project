// Minimal dependency-free CSV export (no papaparse/xlsx-writer available
// offline — see DEPLOYMENT.md).
export function toCSV(headers: string[], rows: (string | number)[][]): string {
  const escape = (v: string | number) => {
    let s = String(v ?? "");
    // Excel runs a cell that starts with = + - @ (or a tab / CR) as a
    // formula, so a remark typed as =HYPERLINK(...) would execute when the
    // export is opened. A leading ' makes it plain text. Plain numbers
    // ("-5", "+2" defect counts) and the "-" grade are left as written.
    if (typeof v === "string" && /^[=+\-@\t\r]/.test(s) && !/^[+-]?\d+(?:\.\d+)?$/.test(s) && s !== "-") s = `'${s}`;
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [headers.map(escape).join(","), ...rows.map((r) => r.map(escape).join(","))];
  return lines.join("\n");
}

export function downloadCSV(filename: string, csv: string): void {
  // The byte-order mark tells Excel the file is UTF-8; without it
  // "Lamination — Quality Control" opened as "Lamination â€” Quality Control".
  downloadBlob(filename, new Blob([String.fromCharCode(0xfeff), csv], { type: "text/csv;charset=utf-8;" }));
}

/** Hands the browser a file to save. */
export function downloadBlob(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * CSV text as a grid: quoted fields, doubled quotes, commas and line breaks
 * inside quotes, CRLF or LF. A semicolon-separated file (Excel's save on a
 * European regional setting) is recognised from its first line, and the '
 * that toCSV puts before a formula-like value is taken off again.
 */
export function parseCSV(text: string): string[][] {
  const src = text.replace(/^\uFEFF/, "");
  const firstLine = src.split(/\r?\n/, 1)[0] ?? "";
  const delimiter = (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? ";" : ",";
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += ch;
    } else if (ch === '"' && field === "") quoted = true;
    else if (ch === delimiter) {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += ch;
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.map((r) => r.map((v) => (/^'[=+\-@]/.test(v) ? v.slice(1) : v).trim()));
}
