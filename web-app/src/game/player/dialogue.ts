export interface ReplayBounds {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface DialogueFrame {
  width: number;
  height: number;
  speaker: string;
  pages: string[];
  page: number;
  chars: number;
  complete: boolean;
  opacity: number;
  showReplay: boolean;
  immersive?: boolean;
}

/**
 * Draw the dialogue box, speaker tab and, when available, the voice replay
 * button. Returns the replay button bounds in logical canvas coordinates.
 */
export function drawDialogue(
  ctx: CanvasRenderingContext2D,
  frame: DialogueFrame,
): ReplayBounds | null {
  const page = frame.pages[frame.page] ?? "";
  const visible = page.slice(0, Math.floor(frame.chars));

  if (frame.immersive) {
    return drawImmersive(ctx, frame, visible);
  }

  const x = 18;
  const y = 326;
  const w = frame.width - 36;
  const h = 142;
  ctx.save();
  ctx.fillStyle = `rgba(7, 8, 12, ${frame.opacity})`;
  ctx.strokeStyle = "rgba(201, 168, 106, 0.72)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 8);
  ctx.fill();
  ctx.stroke();

  let replay: ReplayBounds | null = null;
  if (frame.speaker) {
    ctx.font = '600 17px "Hiragino Mincho ProN", "Yu Mincho", "Noto Serif JP", serif';
    const label = frame.speaker;
    const tw = Math.max(64, ctx.measureText(label).width + 28);
    ctx.fillStyle = `rgba(12, 12, 16, ${frame.opacity})`;
    ctx.strokeStyle = "rgba(201, 168, 106, 0.55)";
    ctx.beginPath();
    ctx.roundRect(x + 12, y - 15, tw, 28, 5);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "rgba(230, 196, 132, 0.95)";
    ctx.textBaseline = "middle";
    ctx.fillText(label, x + 26, y - 1);

    if (frame.showReplay) {
      const bx = Math.min(x + 12 + tw + 6, x + w - 38);
      const by = y - 14;
      const bw = 32;
      const bh = 26;
      replay = { x: bx, y: by, w: bw, h: bh };
      ctx.fillStyle = `rgba(20, 18, 14, ${frame.opacity})`;
      ctx.strokeStyle = "rgba(201, 168, 106, 0.55)";
      ctx.beginPath();
      ctx.roundRect(bx, by, bw, bh, 5);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "rgba(230, 196, 132, 0.95)";
      ctx.font = '600 13px "Hiragino Mincho ProN", "Yu Mincho", "Noto Serif JP", serif';
      ctx.textAlign = "center";
      ctx.fillText("声", bx + bw / 2, by + bh / 2 + 1);
      ctx.textAlign = "start";
    }
  }

  ctx.font = '18px "Hiragino Mincho ProN", "Yu Mincho", "Noto Serif JP", serif';
  ctx.textBaseline = "top";
  ctx.fillStyle = "rgba(236, 232, 220, 0.96)";
  const maxWidth = w - 48;
  const lines: string[] = [];
  for (const para of visible.split("\n")) {
    let line = "";
    for (const ch of para) {
      const candidate = line + ch;
      if (ctx.measureText(candidate).width > maxWidth && line.length > 0) {
        lines.push(line);
        line = ch;
      } else {
        line = candidate;
      }
    }
    lines.push(line);
  }
  const visibleLines = lines.slice(0, 5);
  visibleLines.forEach((line, i) => {
    ctx.fillText(line, x + 24, y + 40 + i * 23);
  });

  if (frame.complete) {
    const blink = Math.floor(performance.now() / 450) % 2 === 0;
    if (blink) {
      ctx.fillStyle = "rgba(201, 168, 106, 0.9)";
      ctx.beginPath();
      ctx.moveTo(x + w - 30, y + h - 22);
      ctx.lineTo(x + w - 20, y + h - 22);
      ctx.lineTo(x + w - 25, y + h - 15);
      ctx.closePath();
      ctx.fill();
    }
  }
  ctx.restore();
  return replay;
}


/** Frameless subtitle pill used by immersive mode. */
function drawImmersive(
  ctx: CanvasRenderingContext2D,
  frame: DialogueFrame,
  visible: string,
): null {
  const width = frame.width;
  const height = frame.height;
  const maxWidth = width * 0.78;
  const font = '18px "Hiragino Mincho ProN", "Yu Mincho", "Noto Serif JP", serif';
  ctx.save();
  ctx.font = font;
  const lines: string[] = [];
  for (const para of visible.split("\n")) {
    let line = "";
    for (const ch of para) {
      const candidate = line + ch;
      if (ctx.measureText(candidate).width > maxWidth && line.length > 0) {
        lines.push(line);
        line = ch;
      } else {
        line = candidate;
      }
    }
    lines.push(line);
  }
  const shown = lines.slice(0, 4);
  let widest = 0;
  for (const line of shown) widest = Math.max(widest, ctx.measureText(line).width);
  const speakerWidth = frame.speaker ? ctx.measureText(`［${frame.speaker}］`).width : 0;
  const pillWidth = Math.min(width - 40, Math.max(220, Math.max(widest, speakerWidth) + 48));
  const lineHeight = 25;
  const pillHeight = 20 + shown.length * lineHeight + (frame.speaker ? 24 : 0);
  const x = (width - pillWidth) / 2;
  const y = height - 34 - pillHeight;

  ctx.fillStyle = `rgba(0, 0, 0, ${0.78 * frame.opacity})`;
  ctx.strokeStyle = `rgba(255, 255, 255, ${0.16 * frame.opacity})`;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(x, y, pillWidth, pillHeight, 8);
  ctx.fill();
  ctx.stroke();

  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  let ty = y + 10;
  if (frame.speaker) {
    ctx.fillStyle = "rgba(230, 196, 132, 0.98)";
    ctx.font = '600 14px "Hiragino Mincho ProN", "Yu Mincho", "Noto Serif JP", serif';
    ctx.fillText(`［${frame.speaker}］`, width / 2, ty);
    ty += 24;
    ctx.font = font;
  }
  ctx.fillStyle = "rgba(245, 243, 238, 0.98)";
  shown.forEach((line, i) => {
    ctx.fillText(line, width / 2, ty + i * lineHeight);
  });
  if (frame.complete && Math.floor(performance.now() / 450) % 2 === 0) {
    ctx.fillStyle = "rgba(201, 168, 106, 0.9)";
    ctx.beginPath();
    ctx.moveTo(x + pillWidth - 24, y + pillHeight - 14);
    ctx.lineTo(x + pillWidth - 15, y + pillHeight - 14);
    ctx.lineTo(x + pillWidth - 19.5, y + pillHeight - 8);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
  return null;
}
