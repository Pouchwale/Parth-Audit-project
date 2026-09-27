import React, { useEffect, useState } from "react";
import { FiVolume2, FiVolumeX } from "react-icons/fi";
import { useAppStore } from "../../store/AppStore";
import { useT } from "../../i18n";
import { settingsRepository } from "../../data/repositories/settingsRepository";
import { updateVoiceSettings, VOICE_SETTINGS_EVENT } from "../../utils/voice";

// THE TOP BAR'S SPEAKER (REQUIREMENTS §81): one press mutes Mitra's sounds AND
// voice, another brings both back. On while either is on — Master Data can set
// them one by one. After the language control, so the bar still begins with the
// connection, the clock and the language (e2e_topbar_status). The word beside
// the icon only where the bar has room; the button keeps its name and tooltip.
export function SoundToggle() {
  const { version } = useAppStore();
  const t = useT();
  const read = () => {
    const s = settingsRepository.get();
    return s.soundsOn || s.voiceOn;
  };
  const [on, setOn] = useState(read);

  // Changed elsewhere (Master Data, the reminder card's 🔇, another device's settings pulled in).
  useEffect(() => {
    setOn(read());
    const onChange = () => setOn(read());
    window.addEventListener(VOICE_SETTINGS_EVENT, onChange);
    return () => window.removeEventListener(VOICE_SETTINGS_EVENT, onChange);
  }, [version]);

  const label = on ? t("voice.toggle.mute") : t("voice.toggle.unmute");
  return (
    <button
      type="button"
      className={`btn btn-ghost btn-sm sound-toggle ${on ? "is-on" : "is-off"}`}
      data-action="toggle-sound"
      aria-pressed={on}
      aria-label={label}
      title={label}
      onClick={() => {
        const next = !on;
        setOn(next);
        updateVoiceSettings({ soundsOn: next, voiceOn: next });
      }}
    >
      {on ? <FiVolume2 size={15} /> : <FiVolumeX size={15} />}
      <span className="sound-toggle-label">{on ? t("voice.toggle.on") : t("voice.toggle.off")}</span>
    </button>
  );
}
