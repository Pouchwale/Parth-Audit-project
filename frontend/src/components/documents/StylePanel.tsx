import React, { useMemo, useState } from "react";
import type { LogSheetLayout, PartStyle } from "../../types";
import { Modal } from "../common/Modal";
import { ALIGN_NAMES, STYLE_FONTS, STYLE_LINE_SPACINGS, STYLE_SIZES, cleanStyle, describeStyle, mmToPx, pxToMm, setPartStyle } from "../../engine/formatStyles";

// THE STYLE OF ONE PART OF A FORMAT, SET IN THE DESIGNER (REQUIREMENTS §318, engine/formatStyles.ts). Opened from a
// heading's, a box's or a printed line's menu - or for the whole sheet from the toolbar - with the parts it can style
// side by side (a column's heading and its values; a box's label and its value). What is chosen is shown on a sample line
// at once, and goes onto the sheet as ONE step of the draft when Apply is pressed: undone with Undo, saved with Save as
// the format's next revision. Every control starts "as issued", and "as issued" takes the part's style off.

export interface StyleTarget {
  key: string;
  /** What the person sees: "Heading", "Values", "Label"... */
  name: string;
  /** The words shown on the sample line. */
  sample: string;
}

const AS_ISSUED = "";

export function StylePanel({
  title,
  targets,
  layout,
  widthOf,
  page,
  onApply,
  onClose,
}: {
  title: string;
  targets: StyleTarget[];
  layout: LogSheetLayout;
  /** A column whose printed width may be set here (its key). */
  widthOf?: string;
  /** The page's way round may be set here (the whole sheet). */
  page?: boolean;
  onApply: (layout: LogSheetLayout) => void;
  onClose: () => void;
}) {
  const [styles, setStyles] = useState<Record<string, PartStyle>>(() => Object.fromEntries(targets.map((t) => [t.key, cleanStyle(layout.styles?.[t.key])])));
  const [at, setAt] = useState(targets[0]?.key ?? "");
  const column = widthOf ? layout.columns.find((c) => c.key === widthOf) : undefined;
  const [width, setWidth] = useState<string>(column?.printWidth ? String(pxToMm(column.printWidth)) : "");
  const [paper, setPaper] = useState<string>(layout.paper ?? AS_ISSUED);
  const s = styles[at] ?? {};
  const target = targets.find((t) => t.key === at);
  const put = (patch: Partial<PartStyle>) => setStyles((all) => ({ ...all, [at]: cleanStyle({ ...all[at], ...patch }) }));
  const numberOr = (v: string): number | undefined => (v.trim() === "" ? undefined : Number(v));

  const sampleStyle = useMemo((): React.CSSProperties => {
    const font = STYLE_FONTS.find((f) => f.name === s.font)?.css;
    return {
      fontWeight: s.bold === undefined ? undefined : s.bold ? 700 : 400,
      fontStyle: s.italic ? "italic" : undefined,
      textDecoration: s.underline ? "underline" : undefined,
      fontSize: s.size ? `${s.size}pt` : undefined,
      fontFamily: font,
      textAlign: s.align,
      lineHeight: s.lineSpacing,
      padding: s.padding !== undefined ? `${s.padding}mm` : "1mm",
      marginTop: s.spaceBefore !== undefined ? `${s.spaceBefore}mm` : undefined,
      marginBottom: s.spaceAfter !== undefined ? `${s.spaceAfter}mm` : undefined,
      minHeight: s.rowHeight !== undefined ? `${s.rowHeight}mm` : undefined,
      border: s.border === "none" ? "0 none" : s.border === "thick" ? "2px solid #000" : "1px solid #999",
      background: "#fff",
      color: "#000",
    };
  }, [s]);

  const apply = () => {
    let next = layout;
    for (const t of targets) next = setPartStyle(next, t.key, styles[t.key]);
    // (only when the width was typed: millimetres and the sheet's pixels do not round back to the same figure)
    if (column && width !== (column.printWidth ? String(pxToMm(column.printWidth)) : "")) {
      const mm = numberOr(width);
      const px = mm !== undefined && mm >= 3 && mm <= 300 ? mmToPx(mm) : undefined;
      if ((column.printWidth ?? undefined) !== px) next = { ...next, columns: next.columns.map((c) => (c.key === column.key ? { ...c, printWidth: px } : c)) };
    }
    if (page) {
      const want = paper === "portrait" || paper === "landscape" ? paper : undefined;
      if (want !== layout.paper) {
        next = { ...next, paper: want };
        if (!want) delete next.paper;
      }
    }
    onApply(next);
  };

  const row = (label: string, control: React.ReactNode, hint?: string) => (
    <label className="style-row" title={hint}>
      <span className="style-row-label">{label}</span>
      {control}
    </label>
  );
  const mmBox = (field: keyof PartStyle, label: string, hint: string) =>
    row(
      label,
      <input
        className="input input-sm"
        type="number"
        min={0}
        step={0.5}
        data-field={`style-${String(field)}`}
        placeholder="as issued"
        value={s[field] === undefined ? "" : String(s[field])}
        onChange={(e) => put({ [field]: numberOr(e.target.value) } as Partial<PartStyle>)}
      />,
      hint,
    );

  return (
    <Modal
      title={title}
      onClose={onClose}
      width={620}
      footer={
        <>
          <button className="btn btn-ghost btn-sm" data-action="style-clear" onClick={() => setStyles((all) => ({ ...all, [at]: {} }))} title="This part back to how the format draws it">
            As issued
          </button>
          <span style={{ flex: 1 }} />
          <button className="btn btn-ghost btn-sm" data-action="style-cancel" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary btn-sm" data-action="style-apply" onClick={apply}>
            Apply
          </button>
        </>
      }
    >
      <div className="style-panel" data-section="style-panel">
        {targets.length > 1 && (
          <div className="style-targets" role="tablist">
            {targets.map((t) => (
              <button key={t.key} type="button" role="tab" aria-selected={t.key === at} className={`btn btn-sm ${t.key === at ? "btn-secondary" : "btn-ghost"}`} data-action="style-target" data-key={t.key} onClick={() => setAt(t.key)}>
                {t.name}
              </button>
            ))}
          </div>
        )}
        <div className="style-sample notranslate" translate="no" data-section="style-sample" style={sampleStyle}>
          {target?.sample || "Sample"}
        </div>
        <p className="text-xs text-muted" data-section="style-summary">
          {describeStyle(s)}
        </p>

        <fieldset className="style-group">
          <legend>Text</legend>
          <div className="style-buttons">
            <select className="input input-sm" data-field="style-bold" value={s.bold === undefined ? "" : s.bold ? "bold" : "plain"} onChange={(e) => put({ bold: e.target.value === "" ? undefined : e.target.value === "bold" })}>
              <option value="">Bold: as issued</option>
              <option value="bold">Bold</option>
              <option value="plain">Not bold</option>
            </select>
            <label className="style-check">
              <input type="checkbox" data-field="style-italic" checked={!!s.italic} onChange={(e) => put({ italic: e.target.checked || undefined })} /> <em>Italic</em>
            </label>
            <label className="style-check">
              <input type="checkbox" data-field="style-underline" checked={!!s.underline} onChange={(e) => put({ underline: e.target.checked || undefined })} /> <u>Underline</u>
            </label>
          </div>
          {row(
            "Size",
            <select className="input input-sm" data-field="style-size" value={s.size ?? ""} onChange={(e) => put({ size: numberOr(e.target.value) })}>
              <option value="">As issued</option>
              {STYLE_SIZES.map((n) => (
                <option key={n} value={n}>
                  {n} pt
                </option>
              ))}
            </select>,
          )}
          {row(
            "Font",
            <select className="input input-sm" data-field="style-font" value={s.font ?? ""} onChange={(e) => put({ font: e.target.value || undefined })}>
              <option value="">As issued</option>
              {STYLE_FONTS.map((f) => (
                <option key={f.name} value={f.name} style={{ fontFamily: f.css }}>
                  {f.name}
                </option>
              ))}
            </select>,
          )}
        </fieldset>

        <fieldset className="style-group">
          <legend>Alignment</legend>
          <div className="style-buttons" role="radiogroup">
            {(["", "left", "center", "right", "justify"] as const).map((a) => (
              <button
                key={a || "issued"}
                type="button"
                role="radio"
                aria-checked={(s.align ?? "") === a}
                className={`btn btn-sm ${(s.align ?? "") === a ? "btn-secondary" : "btn-ghost"}`}
                data-action="style-align"
                data-value={a || "issued"}
                onClick={() => put({ align: a || undefined })}
              >
                {a ? ALIGN_NAMES[a][0].toUpperCase() + ALIGN_NAMES[a].slice(1) : "As issued"}
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset className="style-group">
          <legend>Spacing (mm)</legend>
          {mmBox("spaceBefore", "Space before", "Room above this part")}
          {mmBox("spaceAfter", "Space after", "Room below this part")}
          {row(
            "Line spacing",
            <select className="input input-sm" data-field="style-lineSpacing" value={s.lineSpacing ?? ""} onChange={(e) => put({ lineSpacing: numberOr(e.target.value) })}>
              <option value="">As issued</option>
              {STYLE_LINE_SPACINGS.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>,
          )}
          {mmBox("padding", "Room inside", "Room between the edge of the box or cell and its words")}
          {mmBox("rowHeight", "Line height", "How tall the line (or the box) is drawn")}
        </fieldset>

        <fieldset className="style-group">
          <legend>Table and page</legend>
          {row(
            "Edge",
            <select className="input input-sm" data-field="style-border" value={s.border ?? ""} onChange={(e) => put({ border: (e.target.value || undefined) as PartStyle["border"] })}>
              <option value="">As issued</option>
              <option value="none">No edge</option>
              <option value="thin">Thin</option>
              <option value="thick">Thick</option>
            </select>,
          )}
          {column &&
            row(
              "Column width (mm, printed)",
              <input className="input input-sm" type="number" min={3} max={300} step={1} data-field="style-width" placeholder="follows its words" value={width} onChange={(e) => setWidth(e.target.value)} />,
              "The column's width on paper. Empty: as wide as its words need.",
            )}
          {page &&
            row(
              "Page",
              <select className="input input-sm" data-field="style-page" value={paper} onChange={(e) => setPaper(e.target.value)}>
                <option value="">As issued</option>
                <option value="portrait">Portrait</option>
                <option value="landscape">Landscape</option>
              </select>,
            )}
        </fieldset>
      </div>
    </Modal>
  );
}
