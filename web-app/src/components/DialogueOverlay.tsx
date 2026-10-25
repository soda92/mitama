import { useRef, useState, type CSSProperties, type MouseEvent } from "react";
import type { DialogueOverlayState } from "../game/types";

interface DialogueOverlayProps {
  state: DialogueOverlayState | null;
  showTranslation: boolean;
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
  showTranslation,
  onAdvance,
  onReplay,
}: DialogueOverlayProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const suppressClick = useRef(false);
  const [hovering, setHovering] = useState(false);

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
        <div
          className="dialogue-pill"
          onClick={handleClick}
          onMouseUp={handleMouseUp}
          onMouseEnter={() => setHovering(true)}
          onMouseLeave={() => setHovering(false)}
        >
          {state.speaker && (
            <div className="dialogue-pill-speaker">［{state.speaker}］</div>
          )}
          <p className="dialogue-pill-text">{state.text}</p>
          {showTranslation && state.translation && hovering && (
            <div className="dialogue-pill-translation" role="tooltip">
              {state.translation}
            </div>
          )}
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
              🎙️
            </button>
          )}
        </div>
      )}
      <div
        className="dialogue-panel"
        onClick={handleClick}
        onMouseUp={handleMouseUp}
        onMouseEnter={() => setHovering(true)}
        onMouseLeave={() => setHovering(false)}
      >
        <p className="dialogue-text">{state.text}</p>
        {state.complete && <span className="dialogue-next" aria-hidden="true" />}
      </div>
      {showTranslation && state.translation && hovering && (
        <div className="dialogue-translation" role="tooltip">
          {state.translation}
        </div>
      )}
    </div>
  );
}
