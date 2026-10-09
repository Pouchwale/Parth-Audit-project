// THE RODENT BOX PICKER OF F/HR/17'S CHECK POINTS 8 AND 9 (REQUIREMENTS §104).
//
// Drawn under the check point's row while it is answered Yes and the record is open for writing
// (components/records/DailyPestMonitoringRecordView.tsx), with nothing picked: the person picks. The list is
// engine/rodentBoxes.ts's (Master Data's Active stations, else RC-1 to RC-<check point 4's count>), the words
// engine/rodentBoxWords.ts's. The number typed filters the boxes, Enter picks the one typed; a box is picked or
// taken off with a tap, several allowed; check point 8 also takes another place, one of the 16 Rodent Control
// areas or the person's own words. Every change writes the note as text ("RC-3, RC-17", "RC-3; Other: Canteen")
// into the Note box above, which stays the record's one bound value: the panel itself is screen-only (no-print),
// so the printout and the downloaded file show the note and nothing else.
//
// Fast on a slow laptop: the boxes are plain buttons, at most SHOWN_AT_FIRST until "Show all" or a number is typed.
import { useEffect, useMemo, useRef, useState } from "react";
import { FiX } from "react-icons/fi";
import { boxesMatching, boxesNotOnList, boxGroups, boxIdOf, boxNote, parseBoxNote, takesOtherPlace, type BoxList } from "../../engine/rodentBoxes";
import { boxListSentence, boxWords, RODENT_BOX_WORDS } from "../../engine/rodentBoxWords";
import { useAppStore } from "../../store/AppStore";

const SHOWN_AT_FIRST = 40;
const SHOWN_WHEN_TYPED = 60;

export function RodentBoxPicker({
  no,
  note,
  list,
  places,
  focus,
  onChange,
}: {
  /** The check point: 8 or 9. */
  no: number;
  /** The note as stored. */
  note: string;
  list: BoxList;
  /** The 16 Rodent Control areas, for check point 8's other place. */
  places: string[];
  /** Just answered Yes: the number box takes the focus. */
  focus?: boolean;
  onChange: (note: string) => void;
}) {
  const { uiLang } = useAppStore();
  const w = RODENT_BOX_WORDS[uiLang] ?? RODENT_BOX_WORDS.en;
  const parsed = useMemo(() => parseBoxNote(note, list), [note, list]);
  const picked = useMemo(() => new Set(parsed.boxes), [parsed]);
  // A box in the note that Master Data's list does not have (typed by hand, or taken off the list since): shown in
  // the danger colour with the reason, as Submit will refuse it (engine/validation.ts).
  const offList = useMemo(() => new Set(boxesNotOnList(note, list)), [note, list]);
  const [typed, setTyped] = useState("");
  const [all, setAll] = useState(false);
  // The other place as it is being typed: the note keeps it trimmed, the box keeps the space just typed.
  const [placeDraft, setPlaceDraft] = useState<string | null>(null);
  const numberBox = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (focus) numberBox.current?.focus();
  }, [focus]);

  const matches = useMemo(() => boxesMatching(list, typed), [list, typed]);
  const groups = useMemo(() => boxGroups(typed ? matches.slice(0, SHOWN_WHEN_TYPED) : all ? matches : matches.slice(0, SHOWN_AT_FIRST)), [matches, typed, all]);
  const other = placeDraft ?? parsed.other;

  const write = (boxes: string[], place = other) => onChange(boxNote(boxes, place));
  const toggle = (id: string) => write(picked.has(id) ? parsed.boxes.filter((b) => b !== id) : [...parsed.boxes, id]);
  const pickTyped = () => {
    const id = matches[0] && boxIdOf(typed, list) === matches[0].id ? matches[0].id : matches.length === 1 ? matches[0].id : null;
    if (!id) return;
    if (!picked.has(id)) write([...parsed.boxes, id]);
    setTyped("");
  };
  const placeList = `rodent-places-${no}`;

  return (
    <div className="box-picker" data-box-picker={no}>
      <div className="box-picker-row">
        <span className="text-sm font-semibold">{no === 9 ? w.boxLabel : w.placeLabel}</span>
        {parsed.boxes.length === 0 && <span className="text-xs text-muted">{w.nonePicked}</span>}
        {parsed.boxes.map((b) => (
          <span
            key={b}
            className={`box-chip is-picked notranslate${offList.has(b) ? " is-off" : ""}`}
            translate="no"
            data-picked={b}
            title={offList.has(b) ? boxWords(w.notOnList, { box: b }) : undefined}
          >
            {b}
            <button type="button" className="box-chip-off" aria-label={boxWords(w.remove, { box: b })} title={boxWords(w.remove, { box: b })} onClick={() => toggle(b)}>
              <FiX size={11} />
            </button>
          </span>
        ))}
      </div>
      <div className="box-picker-row">
        <input
          ref={numberBox}
          className="input input-sm box-picker-number"
          inputMode="numeric"
          aria-label={w.typeNumber}
          placeholder={w.typeNumber}
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              pickTyped();
            } else if (e.key === "Escape") setTyped("");
          }}
        />
        {typed && matches.length === 0 && <span className="text-xs text-muted">{boxWords(w.noMatch, { q: typed })}</span>}
      </div>
      <div className="box-picker-boxes notranslate" translate="no">
        {groups.map((g) => (
          <div key={g.area ?? "-"} className="box-picker-row">
            {g.area && <span className="box-picker-area">{g.area}</span>}
            {g.boxes.map((c) => (
              <button key={c.id} type="button" className="box-chip" aria-pressed={picked.has(c.id)} title={c.area} onClick={() => toggle(c.id)}>
                {c.id}
              </button>
            ))}
          </div>
        ))}
        {!typed && !all && matches.length > SHOWN_AT_FIRST && (
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setAll(true)}>
            {boxWords(w.showAll, { n: matches.length })}
          </button>
        )}
      </div>
      {takesOtherPlace(no) && (
        <div className="box-picker-row">
          <label className="text-sm" htmlFor={`${placeList}-input`}>
            {w.otherPlace}
          </label>
          <input
            id={`${placeList}-input`}
            className="input input-sm box-picker-place"
            list={placeList}
            placeholder={w.otherPlaceHint}
            value={other}
            onChange={(e) => {
              setPlaceDraft(e.target.value);
              write(parsed.boxes, e.target.value);
            }}
            onBlur={() => setPlaceDraft(null)}
          />
          <datalist id={placeList}>
            {places.map((p) => (
              <option key={p} value={p} />
            ))}
          </datalist>
        </div>
      )}
      <div className="text-xs text-muted">{boxListSentence(list, uiLang)}</div>
    </div>
  );
}
