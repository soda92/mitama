import { useEffect } from "react";

export type ProtagonistRoute = "yahiro" | "oboro";

interface ProtagonistSelectProps {
  backgroundUrl?: string;
  onSelect: (route: ProtagonistRoute) => void;
  onBack: () => void;
}

const ROUTES: Array<{ id: ProtagonistRoute; label: string; className: string }> = [
  { id: "yahiro", label: "八尋 導かれし魂", className: "yahiro" },
  { id: "oboro", label: "朧 黒き刃の輝き", className: "oboro" },
];

export default function ProtagonistSelect({
  backgroundUrl,
  onSelect,
  onBack,
}: ProtagonistSelectProps) {
  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === "Escape" || ev.key === "Backspace") {
        ev.preventDefault();
        onBack();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onBack]);

  return (
    <div className="protagonist-select" onClick={(ev) => ev.stopPropagation()}>
      {backgroundUrl && (
        <img className="protagonist-bg" src={backgroundUrl} alt="主人公選択" />
      )}
      {ROUTES.map((route) => (
        <button
          key={route.id}
          className={`protagonist-hit ${route.className}`}
          onClick={() => onSelect(route.id)}
          aria-label={route.label}
        >
          <span>{route.label}</span>
        </button>
      ))}
      <button className="protagonist-back" onClick={onBack} aria-label="戻る">
        戻る
      </button>
    </div>
  );
}
