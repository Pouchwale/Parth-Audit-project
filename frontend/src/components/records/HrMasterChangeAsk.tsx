import React, { useState } from "react";
import { createPortal } from "react-dom";
import { Modal } from "../common/Modal";
import type { HrMasterPerson } from "../../types";
import type { MasterChange } from "../../engine/hrMasterChange";
import { formatDisplayDate } from "../../utils/date";

// A DETAIL CHANGED ON AN HR RECORD, ASKED OF HR MASTER DATA (REQUIREMENTS §334): first "update HR Master Data for this
// person?", then, on Yes, "are you sure?" with what the sheet has beside what was typed. Either No leaves the sheet as
// it is; the record keeps what was typed either way. The questions have to be answered: no cross, no click beside.

export interface MasterAsk {
  person: HrMasterPerson;
  box: string;
  changes: MasterChange[];
}

const shown = (c: MasterChange, v: string) => (!v ? "(blank)" : c.key === "joiningDate" || c.key === "dateOfBirth" ? formatDisplayDate(v) : v);
const own = (e: React.SyntheticEvent) => e.stopPropagation();

export function HrMasterChangeAsk({ ask, onSure, onNo }: { ask: MasterAsk; onSure: () => void; onNo: () => void }) {
  const [sure, setSure] = useState(false);
  const who = `${ask.person.fullName}${ask.person.gp3No ? ` (GP3 No. ${ask.person.gp3No})` : ""}`;
  const table = (
    <table className="data-table" style={{ width: "100%", marginTop: 8 }}>
      <thead>
        <tr>
          <th>Detail</th>
          <th>In HR Master Data</th>
          <th>You entered</th>
        </tr>
      </thead>
      <tbody>
        {ask.changes.map((c) => (
          <tr key={c.key}>
            <td>{c.label}</td>
            <td>{shown(c, c.from)}</td>
            <td>
              <strong>{shown(c, c.to)}</strong>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
  const footer = (yes: string, onYes: () => void, no: string) => (
    <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", width: "100%" }}>
      <button className="btn btn-secondary" data-action="master-no" onClick={onNo}>
        {no}
      </button>
      <button className="btn btn-primary" data-action={sure ? "master-sure" : "master-yes"} onClick={onYes}>
        {yes}
      </button>
    </div>
  );
  return createPortal(
    <div data-dialog="hr-master-change" onClick={own} onKeyDown={own} onMouseDown={own}>
      {!sure ? (
        <Modal title="Update HR Master Data too?" onClose={onNo} dismissible={false} footer={footer("Yes, update it", () => setSure(true), "No, only this record")}>
          <p>
            You changed <strong>{ask.box}</strong> for <strong>{who}</strong>. These details came from HR Master Data. Do you want to update HR Master Data for this person too?
          </p>
          {table}
        </Modal>
      ) : (
        <Modal title="Are you sure?" onClose={onNo} dismissible={false} footer={footer("Yes, I am sure", onSure, "No")}>
          <p>
            HR Master Data has different details for <strong>{who}</strong>. If you continue, HR Master Data will be changed as below, and every HR format will take the new
            details from now on. Records already filed keep what they show.
          </p>
          {table}
        </Modal>
      )}
    </div>,
    document.body,
  );
}
