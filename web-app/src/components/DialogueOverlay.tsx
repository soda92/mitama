import { useRef, type CSSProperties, type MouseEvent } from "react";
import type { DialogueOverlayState } from "../game/types";

interface DialogueOverlayProps {
  state: DialogueOverlayState | null;
  onAdvance: () => void;
  onReplay: () => void;
}

function selectionInside(root: HTMLElement | null): boolean {
  if (!root) return false;
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed) return false;
  const anchor = selection.anchorNode;
  const focus = selection.focusNode;
  return !!anchor && !!focus && root.contains(anchor) && root.contains(focus);
}

export default function DialogueOverlay({
  state,
  onAdvance,
  onReplay,
}: DialogueOverlayProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const suppressClick = useRef(false);

  if (!state) return null;

  const handleMouseUp = () => {
    suppressClick.current = selectionInside(rootRef.current);
  };

  const handleClick = (ev: MouseEvent<HTMLElement>) => {
    ev.stopPropagation();
    const selection = window.getSelection();
    if (suppressClick.current || (selection && !selection.isCollapsed)) {
      suppressClick.current = false;
      return;
    }
    onAdvance();
  };

  const handleReplay = (ev: MouseEvent<HTMLButtonElement>) => {
    ev.stopPropagation();
    suppressClick.current = false;
    onReplay();
  };

  const style = { "--dialog-opacity": state.opacity } as CSSProperties;

  if (state.immersive) {
    return (
      <div ref={rootRef} className="dialogue-overlay immersive" style={style}>
        <div className="dialogue-pill" onClick={handleClick} onMouseUp={handleMouseUp}>
          {state.speaker && (
            <div className="dialogue-pill-speaker">［{state.speaker}］</div>
          )}
          <p className="dialogue-pill-text">{state.text}</p>
          {state.complete && <span className="dialogue-next" aria-hidden="true" />}
        </div>
      </div>
    );
  }

  return (
    <div ref={rootRef} className="dialogue-overlay" style={style}>
      {(state.speaker || state.showReplay) && (
        <div className="dialogue-header" onClick={handleClick}>
          {state.speaker && <div className="dialogue-speaker">{state.speaker}</div>}
          {state.showReplay && (
            <button
              type="button"
              className="dialogue-replay"
              onClick={handleReplay}
              aria-label="声を再生"
            >
              声
            </button>
          )}
        </div>
      )}
      <div className="dialogue-panel" onClick={handleClick} onMouseUp={handleMouseUp}>
        <p className="dialogue-text">{state.text}</p>
        {state.complete && <span className="dialogue-next" aria-hidden="true" />}
      </div>
    </div>
  );
}
