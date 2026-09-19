import React from "react";
import { FiUser, FiPlayCircle, FiCheckCircle, FiLogOut, FiZap, FiMenu, FiSidebar } from "react-icons/fi";
import { useAppStore } from "../../store/AppStore";
import { useAuth } from "../../store/AuthContext";
import { useRouter } from "../../store/router";
import { pressable } from "../../utils/pressable";
import { useSidebar } from "../../store/sidebar";
import { useT } from "../../i18n";
import { NotificationBell } from "./NotificationBell";
import { LanguageSwitcher } from "../common/LanguageSwitcher";
import { openBriefing } from "../common/AssistantBriefingPopup";
import { ChangePasswordDialog } from "../common/ChangePasswordDialog";

export function Topbar() {
  const { mode, setMode } = useAppStore();
  const { user, logout } = useAuth();
  const [changingPassword, setChangingPassword] = React.useState(false);
  const { navigate } = useRouter();
  const { visible: sidebarVisible, toggle: toggleSidebar } = useSidebar();
  const t = useT();

  return (
    <>
      <div className="app-topbar no-print">
        <div className="flex items-center gap-3">
          {/* The only way back once the panel is closed, so it lives here
              rather than inside the panel it hides. */}
          <button
            type="button"
            className={`sidebar-toggle ${sidebarVisible ? "is-open" : ""}`}
            data-action="toggle-sidebar"
            onClick={toggleSidebar}
            title={sidebarVisible ? t("nav.closeMenu") : t("nav.openMenu")}
            aria-label={sidebarVisible ? t("nav.closeMenu") : t("nav.openMenu")}
            aria-controls="app-sidebar"
            aria-expanded={sidebarVisible}
          >
            {sidebarVisible ? <FiSidebar size={16} /> : <FiMenu size={16} />}
          </button>
          <div className="pill-tabs">
            <div className={`pill-tab ${mode === "live" ? "active" : ""}`} {...pressable(() => setMode("live"), mode === "live")} title={t("top.liveModeTitle")}>
              <FiCheckCircle size={13} style={{ marginRight: 5, verticalAlign: -2 }} />
              {t("top.liveMode")}
            </div>
            <div
              className={`pill-tab ${mode === "demo" ? "active" : ""}`}
              {...pressable(() => {
                setMode("demo");
                navigate("/demo");
              }, mode === "demo")}
              title={t("top.demoModeTitle")}
            >
              <FiPlayCircle size={13} style={{ marginRight: 5, verticalAlign: -2 }} />
              {t("top.demoMode")}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {/* The one language control for the whole app, reachable from every
              screen; beside it, a word on which translation is showing. */}
          <LanguageSwitcher />
          <button className="btn btn-secondary btn-sm" onClick={openBriefing} title={t("top.briefingTitle")}>
            <FiZap size={13} /> {t("top.todaysBriefing")}
          </button>
          <NotificationBell />
          {/* The person's own name opens "Change password": the plant's named
              accounts start on a password somebody else chose (REQUIREMENTS §62). */}
          <button className="btn btn-ghost btn-sm flex items-center gap-2" data-action="change-password" onClick={() => setChangingPassword(true)} title={`${user?.email ?? ""} — ${t("top.changePassword")}`}>
            <FiUser size={15} className="text-muted" />
            <span className="text-sm font-semibold notranslate" translate="no">{user?.name}</span>
            {user?.role === "admin" && <span className="badge badge-Verified">{t("top.admin")}</span>}
          </button>
          {changingPassword && <ChangePasswordDialog onClose={() => setChangingPassword(false)} />}
          <button className="btn btn-ghost btn-sm" onClick={() => logout()} title={t("top.logOut")}>
            <FiLogOut size={13} /> {t("top.logOut")}
          </button>
        </div>
      </div>
      <div className={`mode-banner no-print ${mode}`}>{mode === "demo" ? t("top.demoBanner") : t("top.liveBanner")}</div>
    </>
  );
}
