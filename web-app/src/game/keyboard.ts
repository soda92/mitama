export interface GameKeyboardContext {
  archiveOpen: boolean;
  navigatorOpen: boolean;
  battleOpen: boolean;
  galleryOpen: boolean;
  homeOpen: boolean;
  menuOpen: boolean;
  uiHidden: boolean;
  started: boolean;
  muted: boolean;
  debugOpen: boolean;
  advance: () => void;
  togglePause: () => void;
  toggleFullscreen: () => void;
  openNavigator: () => void;
  openGallery: () => void;
  setArchiveOpen: (open: boolean) => void;
  setNavigatorOpen: (open: boolean) => void;
  setMenuOpen: (open: boolean) => void;
  setUiHidden: (hidden: boolean) => void;
  setMuted: (muted: boolean) => void;
  setDebugOpen: (open: boolean) => void;
}

export function handleGameKey(ev: KeyboardEvent, o: GameKeyboardContext): void {
  if (ev.key === "Escape") {
    o.setArchiveOpen(false);
    o.setNavigatorOpen(false);
    o.setMenuOpen(false);
    return;
  }
  if (o.battleOpen || o.galleryOpen || o.homeOpen) return;

  const target = ev.target instanceof HTMLElement ? ev.target : null;
  const typing =
    !!target && (target.matches("input, textarea, select") || target.isContentEditable);

  if (o.archiveOpen || o.navigatorOpen) {
    const inSideWindow = !!target?.closest(".side-window");
    if (!typing && !inSideWindow) {
      if (ev.key === "Enter" || ev.key === "ArrowRight" || ev.key === "ArrowDown") {
        ev.preventDefault();
        if (o.uiHidden) o.setUiHidden(false);
        else o.advance();
      } else if (ev.key === "f" || ev.key === "F") {
        o.toggleFullscreen();
      } else if (o.archiveOpen && (ev.key === "n" || ev.key === "N")) {
        o.openNavigator();
      }
    }
    return;
  }

  if (o.menuOpen || typing) return;
  if (ev.key === "Enter" || ev.key === "ArrowRight" || ev.key === "ArrowDown") {
    ev.preventDefault();
    if (o.uiHidden) o.setUiHidden(false);
    else o.advance();
  } else if (ev.code === "Space") {
    ev.preventDefault();
    o.setUiHidden(!o.uiHidden);
  } else if (ev.key === "p" || ev.key === "P") {
    if (o.started) o.togglePause();
  } else if (ev.key === "m" || ev.key === "M") {
    o.setMuted(!o.muted);
  } else if (ev.key === "f" || ev.key === "F") {
    o.toggleFullscreen();
  } else if (ev.key === "d" || ev.key === "D") {
    o.setDebugOpen(!o.debugOpen);
  } else if (ev.key === "n" || ev.key === "N") {
    o.openNavigator();
  } else if (ev.key === "g" || ev.key === "G") {
    o.openGallery();
  }
}

