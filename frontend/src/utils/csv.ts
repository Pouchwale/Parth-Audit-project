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
  const blob = new Blob([String.fromCharCode(0xfeff), csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
