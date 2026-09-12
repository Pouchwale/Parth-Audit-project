import React, { useState } from "react";
import { FiArrowLeft, FiPrinter, FiFileText } from "react-icons/fi";
import { useRouter } from "../store/router";
import { documentRepository } from "../data/repositories/documentRepository";
import { SERVICE_LICENCE } from "../data/seed/serviceLicence";
import { formatDisplayDate } from "../utils/date";
import { printDocument } from "../utils/print";
import { ServiceAgreementReminder } from "../components/documents/ServiceAgreementReminder";

// The service provider's insecticide licence, on file. The scanned pages
// ARE the document and are shown first, exactly as supplied (nothing
// altered — no cropping, no overlays); the transcription below them exists
// so the text can be read comfortably and searched, and is labelled as such.
export function LicencePage() {
  const { navigate } = useRouter();
  const L = SERVICE_LICENCE;
  const doc = documentRepository.getById(L.documentId);
  const [zoom, setZoom] = useState(false);

  return (
    <div className="licence-page">
      <div className="flex items-center justify-between mb-3 no-print wrap gap-2">
        <button className="btn btn-ghost btn-sm" onClick={() => navigate("/pest-control")}>
          <FiArrowLeft size={13} /> Back to Pest Control
        </button>
        <div className="flex items-center gap-2 wrap">
          <span className="badge badge-Verified">On file · issued {formatDisplayDate(L.dateOfIssue)}</span>
          <a className="btn btn-secondary btn-sm" href={L.originalPdf} target="_blank" rel="noopener noreferrer">
            <FiFileText size={13} /> Open the original PDF
          </a>
          <button className="btn btn-secondary btn-sm" onClick={() => setZoom((z) => !z)}>
            {zoom ? "Fit to page" : "Larger scan"}
          </button>
          <button className="btn btn-secondary btn-sm" onClick={() => printDocument()}>
            <FiPrinter size={13} /> Print
          </button>
        </div>
      </div>

      {/* The two-yearly agreement with this service provider: where it stands,
          and the pop-up that asks for it when the term is running out. */}
      <ServiceAgreementReminder />

      <h1 className="text-2xl mb-1">{doc?.name ?? "Insecticide Licence — Gurudev Pesticides (Form III)"}</h1>
      <p className="text-muted mb-4">
        The Government of Gujarat licence held by <strong>Gurudev Pesticides</strong> — the pest control service provider (Gurudev Pest Control) whose technicians
        file the Rat / Mice, Ants & Cockroaches and Fly Control service reports. Kept here <strong>exactly as supplied — nothing in it changed</strong>: the
        original PDF is held as issued and opens from the button above; the pages below are that same file, page for page; the transcription under them is for
        reading and search only.
      </p>

      <div className="card mb-4">
        <div className="card-header">
          <h3 className="text-base font-semibold">
            <FiFileText size={14} style={{ verticalAlign: -2 }} /> Scanned original — {L.sourceFile}
          </h3>
          <span className="text-xs text-muted">
            {L.pages.length} pages · shown unaltered ·{" "}
            <a href={L.originalPdf} target="_blank" rel="noopener noreferrer">
              open the PDF
            </a>
          </span>
        </div>
        {/* The licence as issued — the scanned pages are what prints (utils/print.ts). */}
        <div className="card-pad licence-scans" data-print-doc>
          {L.pages.map((src, i) => (
            <figure key={src} className="licence-scan" style={{ maxWidth: zoom ? 1100 : 760 }}>
              <img src={src} alt={`Insecticide licence — scanned page ${i + 1} of ${L.pages.length}`} />
              <figcaption className="text-xs text-muted">
                Page {i + 1} of {L.pages.length}
              </figcaption>
            </figure>
          ))}
        </div>
      </div>

      <div className="text-xs text-faint mb-2 no-print">Transcription (verbatim, for reading and search — the scan above is authoritative)</div>

      <div className="doc-header notranslate" translate="no">
        <div className="company-name">{L.issuer}</div>
        <div className="doc-title">
          {L.form} — {L.formTitle}
        </div>
        <div className="meta-row">
          <div className="meta-cell">
            <span className="k">Registration No</span>
            <span className="v">{L.registrationNo}</span>
          </div>
          <div className="meta-cell">
            <span className="k">License No</span>
            <span className="v">{L.licenseNo}</span>
          </div>
          <div className="meta-cell">
            <span className="k">Date of issue</span>
            <span className="v">{formatDisplayDate(L.dateOfIssue)}</span>
          </div>
          <div className="meta-cell">
            <span className="k">Valid upto</span>
            <span className="v">{L.validUpto}</span>
          </div>
        </div>
      </div>

      <div className="card mt-4">
        <div className="card-pad">
          <div className="text-xs text-muted mb-1">{L.formRule}</div>
          <p className="text-sm mb-3">{L.grantText}</p>
          <p className="text-sm mb-2">{L.supervisionText}</p>
          <div className="doc-table mb-3 notranslate" translate="no" style={{ maxWidth: 620 }}>
            <table className="compact">
              <tbody>
                <tr>
                  <th style={{ width: 140 }}>Name</th>
                  <td>{L.expertStaff.name}</td>
                </tr>
                <tr>
                  <th>Designation</th>
                  <td>{L.expertStaff.designation}</td>
                </tr>
                <tr>
                  <th>Qualification</th>
                  <td>{L.expertStaff.qualification}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="text-sm mb-3">{L.conditionsNote}</p>
          <div className="flex gap-6 wrap text-sm">
            <div>
              <div className="text-xs text-muted">Date</div>
              <div>{L.signedDate}</div>
            </div>
            <div>
              <div className="text-xs text-muted">Seal</div>
              <div>{L.seal}</div>
            </div>
            <div>
              <div className="text-xs text-muted">Signed</div>
              <div>
                {L.signatory.name} — {L.signatory.title}
              </div>
            </div>
            <div>
              <div className="text-xs text-muted">Footer</div>
              <div>
                {L.department} · {L.printStamp}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="card mt-4">
        <div className="card-header">
          <h3 className="text-base font-semibold">{L.termsTitle}</h3>
          <span className="text-sm text-muted">{L.applicantLine}</span>
        </div>
        <div className="doc-table notranslate" translate="no" style={{ border: "none" }}>
          <table className="licence-terms">
            <thead>
              <tr>
                <th style={{ width: 70 }}>Sr No.</th>
                <th>Description</th>
              </tr>
            </thead>
            <tbody>
              {L.terms.map((t) => (
                <tr key={t.srNo}>
                  <td className="font-semibold">{t.srNo}</td>
                  <td className="text-sm">{t.text}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="card-pad text-xs text-faint" style={{ paddingTop: 8 }}>
          Sr. Nos. are exactly as printed on the licence — 8, 11 and 12 do not appear on the page.
        </div>
      </div>

      <div className="card mt-4">
        <div className="card-pad text-sm">
          <strong>Validity.</strong> The licence states "Valid upto — As per prevailing norms"; its number carries the period 2023-2024 and condition 6 makes renewal an
          application under rule 10(3A) of the Insecticides Rules, 1971. The current renewal status is <span className="tbc">TO BE CONFIRMED</span> with Gurudev
          Pest Control — when the renewed licence is received, replace the scan in <code>source-documents/</code> and update the numbers in{" "}
          <code>src/data/seed/serviceLicence.ts</code>.
        </div>
      </div>
    </div>
  );
}
