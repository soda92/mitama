import type { BattlePolicy } from "../game/settings";
import type { PackInfo } from "../game/types";

interface SettingsPanelProps {
  packId: string;
  packs: PackInfo[];
  currentScene: string;
  currentPC: number;
  status: string;
  bgmVolume: number;
  seVolume: number;
  dialogOpacity: number;
  immersiveMode: boolean;
  battlePolicy: BattlePolicy;
  onClose: () => void;
  onPackChange: (id: string) => void;
  onBgmVolume: (value: number) => void;
  onSeVolume: (value: number) => void;
  onDialogOpacity: (value: number) => void;
  onImmersiveMode: (value: boolean) => void;
  onBattlePolicy: (value: BattlePolicy) => void;
  onArchives: () => void;
  onNavigate: () => void;
  onDebug: () => void;
  onGallery: () => void;
  onReload: () => void;
}

const percent = (value: number) => `${Math.round(value * 100)}%`;

export default function SettingsPanel({
  packId,
  packs,
  currentScene,
  currentPC,
  status,
  bgmVolume,
  seVolume,
  dialogOpacity,
  immersiveMode,
  battlePolicy,
  onClose,
  onPackChange,
  onBgmVolume,
  onSeVolume,
  onDialogOpacity,
  onImmersiveMode,
  onBattlePolicy,
  onArchives,
  onNavigate,
  onDebug,
  onGallery,
  onReload,
}: SettingsPanelProps) {
  return (
    <div
      className="save-overlay"
      onClick={(ev) => {
        ev.stopPropagation();
        onClose();
      }}
    >
      <div className="save-panel settings-panel" onClick={(ev) => ev.stopPropagation()}>
        <div className="save-head">
          <strong>Settings</strong>
          <button onClick={onClose}>✕</button>
        </div>
        <div className="kv settings-kv">
          <span>scene</span>
          <b>{currentScene || "—"}</b>
          <span>command</span>
          <b>cmd {currentPC}</b>
          <span>status</span>
          <b>{status}</b>
        </div>
        <label className="settings-row">
          <span>pack</span>
          <select className="pack" value={packId} onChange={(ev) => onPackChange(ev.target.value)}>
            {packs.map((pack) => (
              <option key={pack.id} value={pack.id}>
                {pack.title}
              </option>
            ))}
          </select>
        </label>
        <label className="settings-row">
          <span>BGM volume</span>
          <input
            type="range"
            min={0}
            max={100}
            value={Math.round(bgmVolume * 100)}
            onChange={(ev) => onBgmVolume(Number(ev.target.value) / 100)}
          />
          <b className="setting-value">{percent(bgmVolume)}</b>
        </label>
        <label className="settings-row">
          <span>SE volume</span>
          <input
            type="range"
            min={0}
            max={100}
            value={Math.round(seVolume * 100)}
            onChange={(ev) => onSeVolume(Number(ev.target.value) / 100)}
          />
          <b className="setting-value">{percent(seVolume)}</b>
        </label>
        <label className="settings-row">
          <span>dialog opacity</span>
          <input
            type="range"
            min={0}
            max={100}
            value={Math.round(dialogOpacity * 100)}
            onChange={(ev) => onDialogOpacity(Number(ev.target.value) / 100)}
          />
          <b className="setting-value">{percent(dialogOpacity)}</b>
        </label>
        <label className="settings-row">
          <span>immersive mode</span>
          <input
            type="checkbox"
            checked={immersiveMode}
            onChange={(ev) => onImmersiveMode(ev.target.checked)}
          />
        </label>
        <label className="settings-row">
          <span>battle</span>
          <select
            className="pack"
            value={battlePolicy}
            onChange={(ev) => onBattlePolicy(ev.target.value as BattlePolicy)}
          >
            <option value="play">play battle</option>
            <option value="win">auto-win</option>
            <option value="lose">auto-lose</option>
            <option value="random">random</option>
          </select>
        </label>
        <div className="settings-actions">
          <button onClick={onArchives}>Archives</button>
          <button onClick={onNavigate}>Navigate</button>
          <button onClick={onDebug}>Debug</button>
          <button onClick={onGallery}>Gallery</button>
          <button onClick={onReload}>Reload scene</button>
        </div>
      </div>
    </div>
  );
}
