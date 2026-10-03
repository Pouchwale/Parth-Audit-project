// MITRA ON YOUR PHONE (2-Oct-2026): a small card at the foot of the Ask Mitra
// page's conversation list.
//
// The plant's phones, Android and iPhone, run the Mitra app in Expo Go from the
// server PC. Folded, the card says so in one line and offers "Show the code";
// opened, it asks the server where the phone app is (components/mitra/
// phoneLink.ts), draws the QR code that opens it in Expo Go, writes the address
// under it, and lists what to do on the phone. If the server says the phone app
// is not running, the card says so plainly and to ask the administrator.
//
// Nothing is asked or drawn until the card is opened: a page that is only
// passing through makes no request and builds no code. The card is screen
// only (.no-print), and adds nothing the suites count on this page — no box to
// type in, no Send, no button that says "Ask Mitra".
import { useEffect, useId, useMemo, useState } from "react";
import { FiAlertCircle, FiSmartphone } from "react-icons/fi";
import { useT } from "../../i18n";
import { QR_QUIET_ZONE, fetchPhoneApp, phoneTarget, qrArt, type PhoneTarget } from "./phoneLink";

/** A QR code, drawn as one path on a white square with its quiet zone. */
export function MitraQr({ text, label }: { text: string; label: string }) {
  const art = useMemo(() => qrArt(text), [text]);
  if (!art) return null;
  const q = QR_QUIET_ZONE;
  const box = art.size + 2 * q;
  return (
    <svg className="mitra-qr" viewBox={`${-q} ${-q} ${box} ${box}`} role="img" aria-label={label} shapeRendering="crispEdges" focusable="false">
      <rect x={-q} y={-q} width={box} height={box} fill="#ffffff" />
      <path d={art.path} fill="#0b2230" />
    </svg>
  );
}

const STEPS = ["ai.phone.step1", "ai.phone.step2", "ai.phone.step3", "ai.phone.step4", "ai.phone.step5"] as const;

/** `onOpenChange`: told when the card opens or folds (the page gives it the conversations' room while it is open). */
export function MitraPhoneCard({ onOpenChange }: { onOpenChange?: (open: boolean) => void } = {}) {
  const t = useT();
  const bodyId = useId();
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState<PhoneTarget | null>(null);
  const toggle = () => {
    const next = !open;
    setOpen(next);
    onOpenChange?.(next);
  };

  // Asked each time the card is opened: the phone app may have been started since.
  useEffect(() => {
    if (!open) return;
    let alive = true;
    void fetchPhoneApp().then((answer) => {
      if (alive) setTarget(phoneTarget(window.location.hostname, answer));
    });
    return () => {
      alive = false;
    };
  }, [open]);

  return (
    <section className="mitra-phone no-print" data-section="mitra-phone" aria-label={t("ai.phone.title")}>
      <div className="mitra-phone-head">
        <span className="mitra-phone-icon" aria-hidden="true">
          <FiSmartphone size={16} />
        </span>
        <div className="mitra-phone-words">
          <div className="mitra-phone-title">{t("ai.phone.title")}</div>
          {/* Opened, the steps say it all, and the code needs the room. */}
          {!open && <div className="mitra-phone-lead">{t("ai.phone.lead")}</div>}
        </div>
      </div>
      <button
        type="button"
        className="btn btn-secondary btn-sm mitra-phone-toggle"
        data-action="phone-code"
        aria-expanded={open}
        aria-controls={bodyId}
        onClick={toggle}
      >
        {open ? t("ai.phone.hide") : t("ai.phone.show")}
      </button>
      {open && (
        <div className="mitra-phone-body" id={bodyId}>
          <figure className="mitra-phone-code">
            {target ? (
              <MitraQr text={target.url} label={`${t("ai.phone.qrLabel")}: ${target.url}`} />
            ) : (
              <div className="mitra-phone-wait" role="status">
                {t("ai.phone.finding")}
              </div>
            )}
            {target && (
              <figcaption className="mitra-phone-url" translate="no">
                {target.url}
              </figcaption>
            )}
          </figure>
          {target?.running === false && (
            <p className="mitra-phone-note is-warning" role="status">
              <FiAlertCircle size={14} aria-hidden="true" />
              <span>{t("ai.phone.notRunning")}</span>
            </p>
          )}
          {target && !target.reachable && (
            <p className="mitra-phone-note">
              <FiAlertCircle size={14} aria-hidden="true" />
              <span>{t("ai.phone.loopback")}</span>
            </p>
          )}
          <ol className="mitra-phone-steps">
            {STEPS.map((key) => (
              <li key={key}>{t(key)}</li>
            ))}
          </ol>
        </div>
      )}
    </section>
  );
}
