export interface GameKeyboardContext {
  archiveOpen: boolean;
  navigatorOpen: boolean;
  battleOpen: boolean;
  galleryOpen: boolean;
  homeOpen: boolean;
  menuOpen: boolean;
  helpOpen: boolean;
  immersive: boolean;
  uiHidden: boolean;
  started: boolean;
  muted: boolean;
  debugOpen: boolean;
  advance: () => void;
  togglePause: () => void;
  toggleLanguage: () => void;
  toggleHoverTranslation: () => void;
  toggleFullscreen: () => void;
  openNavigator: () => void;
  openArchives: () => void;
  openGallery: () => void;
  setImmersive: (value: boolean) => void;
  setArchiveOpen: (open: boolean) => void;
  setNavigatorOpen: (open: boolean) => void;
  setMenuOpen: (open: boolean) => void;
  setHelpOpen: (open: boolean) => void;
  setUiHidden: (hidden: boolean) => void;
  setMuted: (muted: boolean) => void;
  setDebugOpen: (open: boolean) => void;
}

export function handleGameKey(ev: KeyboardEvent, o: GameKeyboardContext): void {
  const target = ev.target instanceof HTMLElement ? ev.target : null;
  const typing =
    !!target && (target.matches("input, textarea, select") || target.isContentEditable);
  const inSideWindow = !!target?.closest(".side-window");

  // "?" (Shift-/ on most layouts) toggles the shortcut help from any screen.
  if (!typing && (ev.key === "?" || (ev.code === "Slash" && ev.shiftKey))) {
    ev.preventDefault();
    o.setHelpOpen(!o.helpOpen);
    return;
  }

  if (ev.key === "Escape") {
    if (o.helpOpen) {
      o.setHelpOpen(false);
      return;
    }
    o.setArchiveOpen(false);
    o.setNavigatorOpen(false);
    o.setMenuOpen(false);
    return;
  }

  if (o.helpOpen) return;
  if (o.battleOpen || o.galleryOpen || o.homeOpen) return;

  // Space still hides dialogue/HUD while a side dock is open. Inputs keep
  // their normal Space behaviour; side-panel buttons can still be used with
  // Enter or the mouse.
  if (!typing && ev.code === "Space") {
    ev.preventDefault();
    o.setUiHidden(!o.uiHidden);
    return;
  }

  if (o.archiveOpen || o.navigatorOpen) {
    if (!typing && !inSideWindow) {
      if (ev.key === "Enter" || ev.key === "ArrowRight" || ev.key === "ArrowDown") {
        ev.preventDefault();
        if (o.uiHidden) o.setUiHidden(false);
        else o.advance();
      } else if (ev.key === "f" || ev.key === "F") {
        o.toggleFullscreen();
      } else if (o.archiveOpen && (ev.key === "n" || ev.key === "N")) {
        o.openNavigator();
      } else if (ev.key === "a" || ev.key === "A") {
        ev.preventDefault();
        if (o.archiveOpen) o.setArchiveOpen(false);
        else o.openArchives();
      }
    }
    return;
  }

  if (o.menuOpen || typing) return;
  if (ev.key === "Enter" || ev.key === "ArrowRight" || ev.key === "ArrowDown") {
    ev.preventDefault();
    if (o.uiHidden) o.setUiHidden(false);
    else o.advance();
  } else if (ev.key === "p" || ev.key === "P") {
    if (o.started) o.togglePause();
  } else if (ev.key === "l" || ev.key === "L") {
    o.toggleLanguage();
  } else if (ev.key === "h" || ev.key === "H") {
    o.toggleHoverTranslation();
  } else if (ev.key === "m" || ev.key === "M") {
    o.setMuted(!o.muted);
  } else if (ev.key === "f" || ev.key === "F") {
    o.toggleFullscreen();
  } else if (ev.key === "i" || ev.key === "I") {
    o.setImmersive(!o.immersive);
  } else if (ev.key === "d" || ev.key === "D") {
    o.setDebugOpen(!o.debugOpen);
  } else if (ev.key === "n" || ev.key === "N") {
    o.openNavigator();
  } else if (ev.key === "a" || ev.key === "A") {
    o.openArchives();
  } else if (ev.key === "g" || ev.key === "G") {
    o.openGallery();
  }
}

