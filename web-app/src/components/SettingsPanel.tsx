import type { BattlePolicy, Language, TypewriterMode } from "../game/settings";
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
  language: Language;
  typewriterMode: TypewriterMode;
  hoverTranslation: boolean;
  onClose: () => void;
  onPackChange: (id: string) => void;
  onBgmVolume: (value: number) => void;
  onSeVolume: (value: number) => void;
  onDialogOpacity: (value: number) => void;
  onImmersiveMode: (value: boolean) => void;
  onBattlePolicy: (value: BattlePolicy) => void;
  onLanguage: (value: Language) => void;
  onTypewriterMode: (value: TypewriterMode) => void;
  onHoverTranslation: (value: boolean) => void;
  onArchives: () => void;
  onNavigate: () => void;
  onDebug: () => void;
  onGallery: () => void;
  onTitle: () => void;
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
  language,
  typewriterMode,
  hoverTranslation,
  onClose,
  onPackChange,
  onBgmVolume,
  onSeVolume,
  onDialogOpacity,
  onImmersiveMode,
  onBattlePolicy,
  onLanguage,
  onTypewriterMode,
  onHoverTranslation,
  onArchives,
  onNavigate,
  onDebug,
  onGallery,
  onTitle,
  onReload,
}: SettingsPanelProps) {
  return (
    <aside className="side-window settings-window">
      <header className="settings-head">
        <div className="side-head-top">
          <strong>Settings</strong>
          <span>{currentScene || "—"}:{currentPC}</span>
          <button className="side-close" onClick={onClose} title="Close">
            ✕
          </button>
        </div>
      </header>
      <div className="settings-scroll">
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
          <span>language</span>
          <select
            className="pack"
            value={language}
            onChange={(ev) => onLanguage(ev.target.value as Language)}
          >
            <option value="ja">日本語</option>
            <option value="en">English</option>
          </select>
        </label>
        <label className="settings-row">
          <span>typewriter</span>
          <select
            className="pack"
            value={typewriterMode}
            onChange={(ev) => onTypewriterMode(ev.target.value as TypewriterMode)}
          >
            <option value="char">character</option>
            <option value="word">word</option>
            <option value="instant">instant</option>
          </select>
        </label>
        <label className="settings-row">
          <span>hover English</span>
          <input
            type="checkbox"
            checked={hoverTranslation}
            onChange={(ev) => onHoverTranslation(ev.target.checked)}
          />
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
          <button onClick={onTitle}>Title</button>
          <button onClick={onReload}>Reload scene</button>
        </div>
      </div>
    </aside>
  );
}
