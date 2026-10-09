// MASTER DATA → RODENT STATIONS (REQUIREMENTS §104).
//
// The plant's own list of rodent boxes, which F/HR/17's check points 8 and 9 offer when they are answered Yes
// (components/records/RodentBoxPicker.tsx; the Active ones only). Nothing is seeded: no list was in the papers
// supplied, and the GAP report of Dec-2023 found the numbering missing, so the plant enters its boxes here.
//
//   * The Station ID is the number painted on the box, typed over in place and kept when the box leaves the field
//     (Enter or a click elsewhere); one that is empty, or that another box has already (RC-05 is RC-5), is refused in
//     words and the box keeps its ID.
//   * "Add RC-1 to RC-N" (the super admin's): a prefix, a first and a last number, and optionally the area and the
//     type they all share; the boxes come Active, and one already on the list is left as it is.
//   * Location is one of the 16 Rodent Control areas (Master Data → Areas, the Rodent Control Service Report's);
//     a location typed before this stays offered beside them.
//   * Status: Active boxes are offered by the pickers; Inactive ones are not, and are still allowed on the records
//     that name them (engine/rodentBoxes.ts boxesNotOnList).
// Long lists come ROWS_AT_FIRST at a time, so a hundred boxes do not draw four hundred boxes at once on a slow laptop.
import { useEffect, useState } from "react";
import { FiPlus, FiTrash2 } from "react-icons/fi";
import { TBC, type RodentStation } from "../../types";
import { masterRepository } from "../../data/repositories/masterRepository";
import { addStationsInBulk, MOST_ADDED_AT_ONCE, nextStationId, RODENT_BOX_PREFIX, stationIdProblem } from "../../engine/rodentBoxes";
import { boxWords, RODENT_BOX_WORDS } from "../../engine/rodentBoxWords";
import { useAppStore } from "../../store/AppStore";
import { useAuth } from "../../store/AuthContext";

const RODENT_AREA_CONTEXT = "service-report:Rodent Control Service";
const STATION_TYPES: RodentStation["type"][] = ["Tamper Proof Bait Station", "Glue Board / Glue Trap", "Bait Tray", "TO BE CONFIRMED"];
const STATION_STATUSES: RodentStation["status"][] = ["Active", "Inactive", "TO BE CONFIRMED"];
const ROWS_AT_FIRST = 50;

type Said = { ok: boolean; text: string } | null;

export function RodentStations() {
  const { bump, uiLang } = useAppStore();
  const { user } = useAuth();
  const w = (RODENT_BOX_WORDS[uiLang] ?? RODENT_BOX_WORDS.en).stations;
  const master = masterRepository.get();
  const stations = master.rodentStations ?? [];
  const areas = master.areas.filter((a) => a.context === RODENT_AREA_CONTEXT).map((a) => a.name);
  const [rows, setRows] = useState(ROWS_AT_FIRST);
  const [said, setSaid] = useState<Said>(null);
  const [confirming, setConfirming] = useState<number | null>(null);
  const active = stations.filter((s) => s.status === "Active").length;

  const save = (next: RodentStation[]) => {
    masterRepository.update({ rodentStations: next });
    bump();
  };
  const set = (i: number, patch: Partial<RodentStation>) => save(stations.map((s, j) => (j === i ? { ...s, ...patch } : s)));
  const placesFor = (location: string) => [TBC, ...areas, ...(location && location !== TBC && !areas.includes(location) ? [location] : [])];

  return (
    <div data-section="rodent-stations">
      <p className="text-muted text-sm mb-2">{w.lead}</p>
      {stations.length === 0 ? (
        <div className="card mb-3">
          <div className="card-pad text-sm tbc">{w.noneYet}</div>
        </div>
      ) : (
        <p className="text-sm mb-2" data-field="station-count">
          {boxWords(w.count, { n: stations.length, active })}
        </p>
      )}
      {user?.role === "admin" && <BulkAdd stations={stations} areas={areas} onAdded={save} onSaid={setSaid} />}
      {said && (
        <div className={`text-sm mb-2 ${said.ok ? "text-success" : "text-danger"}`} role="status" data-field="stations-said">
          {said.text}
        </div>
      )}
      <div className="doc-table">
        <table>
          <thead>
            <tr>
              <th>{w.colId}</th>
              <th>{w.colLocation}</th>
              <th>{w.colType}</th>
              <th>{w.colStatus}</th>
              <th style={{ width: 40 }}></th>
            </tr>
          </thead>
          <tbody className="notranslate" translate="no">
            {stations.slice(0, rows).map((s, i) => (
              <tr key={i}>
                <td>
                  <StationIdInput
                    value={s.id}
                    label={w.colId}
                    onCommit={(id) => {
                      const problem = stationIdProblem(stations, i, id);
                      if (problem) {
                        setSaid({ ok: false, text: problem === "taken" ? boxWords(w.idTaken, { id: id.trim() }) : w.idEmpty });
                        return false;
                      }
                      setSaid(null);
                      set(i, { id: id.trim() });
                      return true;
                    }}
                  />
                </td>
                <td>
                  <select className={`input input-sm ${s.location === TBC ? "tbc" : ""}`} aria-label={w.colLocation} value={s.location || TBC} onChange={(e) => set(i, { location: e.target.value })}>
                    {placesFor(s.location).map((a) => (
                      <option key={a} value={a}>
                        {a}
                      </option>
                    ))}
                  </select>
                </td>
                <td>
                  <select className={`input input-sm ${s.type === TBC ? "tbc" : ""}`} aria-label={w.colType} value={s.type} onChange={(e) => set(i, { type: e.target.value as RodentStation["type"] })}>
                    {STATION_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </td>
                <td>
                  <select className={`input input-sm ${s.status === TBC ? "tbc" : ""}`} aria-label={w.colStatus} value={s.status} onChange={(e) => set(i, { status: e.target.value as RodentStation["status"] })}>
                    {STATION_STATUSES.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </td>
                <td style={{ whiteSpace: "nowrap" }}>
                  {confirming === i ? (
                    <span className="flex gap-1">
                      <button
                        className="btn btn-danger btn-sm"
                        data-action="confirm-delete"
                        onClick={() => {
                          setConfirming(null);
                          save(stations.filter((_, j) => j !== i));
                        }}
                      >
                        {w.removeYes}
                      </button>
                      <button className="btn btn-ghost btn-sm" onClick={() => setConfirming(null)}>
                        {w.removeNo}
                      </button>
                    </span>
                  ) : (
                    <button className="btn btn-ghost btn-sm btn-icon" onClick={() => setConfirming(i)} title={w.removeAsk} aria-label={w.removeAsk}>
                      <FiTrash2 size={13} />
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex gap-2 wrap mt-2">
        <button
          className="btn btn-secondary btn-sm"
          onClick={() => {
            save([...stations, { id: nextStationId(stations), location: TBC, type: "TO BE CONFIRMED", status: "Active" }]);
            setRows((r) => Math.max(r, stations.length + 1));
          }}
        >
          <FiPlus size={13} /> {w.addRow}
        </button>
        {stations.length > rows && (
          <button className="btn btn-ghost btn-sm" onClick={() => setRows((r) => r + ROWS_AT_FIRST)}>
            {boxWords(w.showMore, { n: Math.min(ROWS_AT_FIRST, stations.length - rows) })}
          </button>
        )}
      </div>
    </div>
  );
}

/** The Station ID box: kept while it is typed, stored when the box is left (Enter or a click elsewhere), put back when refused. */
function StationIdInput({ value, label, onCommit }: { value: string; label: string; onCommit: (id: string) => boolean }) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const commit = () => {
    if (draft === value) return;
    if (!onCommit(draft)) setDraft(value);
  };
  return (
    <input
      className="input input-sm"
      aria-label={label}
      data-field="station-id"
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        else if (e.key === "Escape") setDraft(value);
      }}
    />
  );
}

/** "Add RC-1 to RC-N": the super admin's (REQUIREMENTS §104). */
function BulkAdd({ stations, areas, onAdded, onSaid }: { stations: RodentStation[]; areas: string[]; onAdded: (next: RodentStation[]) => void; onSaid: (said: Said) => void }) {
  const { uiLang } = useAppStore();
  const w = (RODENT_BOX_WORDS[uiLang] ?? RODENT_BOX_WORDS.en).stations;
  const [prefix, setPrefix] = useState(RODENT_BOX_PREFIX);
  const [from, setFrom] = useState("1");
  const [to, setTo] = useState("");
  const [location, setLocation] = useState("");
  const [type, setType] = useState<RodentStation["type"]>("TO BE CONFIRMED");
  const p = prefix.trim().toUpperCase() || RODENT_BOX_PREFIX;
  const add = () => {
    const result = addStationsInBulk(stations, { prefix, from: Number(from), to: Number(to), location, type });
    if ("problem" in result) {
      onSaid({ ok: false, text: result.problem === "prefix" ? w.badPrefix : result.problem === "tooMany" ? boxWords(w.tooMany, { n: MOST_ADDED_AT_ONCE }) : w.badRange });
      return;
    }
    if (result.added.length) onAdded(result.stations);
    onSaid({
      ok: true,
      text: [boxWords(w.added, { n: result.added.length }), result.kept.length ? boxWords(w.kept, { n: result.kept.length }) : ""].filter(Boolean).join(" "),
    });
  };
  return (
    <div className="card mb-3" data-section="stations-bulk">
      <div className="card-pad">
        <div className="text-sm font-semibold">{w.bulkTitle}</div>
        <p className="text-xs text-muted mb-2">{w.bulkLead}</p>
        <div className="flex gap-2 wrap items-end">
          <div className="field" style={{ width: 90 }}>
            <label htmlFor="stations-prefix">{w.prefix}</label>
            <input id="stations-prefix" className="input input-sm" value={prefix} onChange={(e) => setPrefix(e.target.value)} />
          </div>
          <div className="field" style={{ width: 80 }}>
            <label htmlFor="stations-from">{w.from}</label>
            <input id="stations-from" className="input input-sm" inputMode="numeric" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div className="field" style={{ width: 80 }}>
            <label htmlFor="stations-to">{w.to}</label>
            <input id="stations-to" className="input input-sm" inputMode="numeric" placeholder="100" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          <div className="field" style={{ minWidth: 200 }}>
            <label htmlFor="stations-location">{w.location}</label>
            <select id="stations-location" className="input input-sm" value={location} onChange={(e) => setLocation(e.target.value)}>
              <option value="">{w.later}</option>
              {areas.map((a) => (
                <option key={a} value={a} className="notranslate" translate="no">
                  {a}
                </option>
              ))}
            </select>
          </div>
          <div className="field" style={{ minWidth: 180 }}>
            <label htmlFor="stations-type">{w.type}</label>
            <select id="stations-type" className="input input-sm" value={type} onChange={(e) => setType(e.target.value as RodentStation["type"])}>
              {STATION_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
          <button className="btn btn-primary btn-sm" data-action="stations-bulk-add" onClick={add}>
            <FiPlus size={13} /> {boxWords(w.bulkButton, { first: `${p}-${from.trim() || "1"}`, last: `${p}-${to.trim() || "N"}` })}
          </button>
        </div>
      </div>
    </div>
  );
}
