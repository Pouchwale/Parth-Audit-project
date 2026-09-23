import React from "react";
import { FiX } from "react-icons/fi";

export function Modal({
  title,
  onClose,
  children,
  footer,
  width = 560,
  dismissible = true,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  width?: number;
  /**
   * False for the few pop-ups that must be answered rather than waved away —
   * the first password an account the administrator made has to choose
   * (REQUIREMENTS §66): no cross, and clicking beside it does nothing.
   */
  dismissible?: boolean;
}) {
  return (
    <div className="modal-overlay" onClick={dismissible ? onClose : undefined}>
      <div className="modal-box" style={{ maxWidth: width }} onClick={(e) => e.stopPropagation()}>
        <div className="card-header">
          <h3 className="text-lg">{title}</h3>
          {dismissible && (
            <button className="btn btn-ghost btn-icon" onClick={onClose} aria-label="Close">
              <FiX size={18} />
            </button>
          )}
        </div>
        <div className="card-pad">{children}</div>
        {footer && (
          <div className="card-header" style={{ borderTop: "1px solid var(--color-border)", borderBottom: "none" }}>
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
