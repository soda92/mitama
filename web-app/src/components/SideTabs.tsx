export type SideTab = "archives" | "navigator" | "settings";

interface SideTabsProps {
  active: SideTab;
  onSelect: (tab: SideTab) => void;
  onClose: () => void;
}

const TABS: Array<{ id: SideTab; label: string }> = [
  { id: "archives", label: "Archives" },
  { id: "navigator", label: "Navigator" },
  { id: "settings", label: "Settings" },
];

export default function SideTabs({ active, onSelect, onClose }: SideTabsProps) {
  return (
    <nav className="side-dock-tabs" aria-label="Side panels">
      {TABS.map((tab) => (
        <button
          key={tab.id}
          className={active === tab.id ? "on" : ""}
          onClick={() => onSelect(tab.id)}
        >
          {tab.label}
        </button>
      ))}
      <button className="side-dock-close" onClick={onClose} title="Close side panel">
        ✕
      </button>
    </nav>
  );
}
