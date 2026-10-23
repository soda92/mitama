/**
 * Remove a black sprite background, but only where it is connected to the
 * image border. This preserves black details inside the character (eyes,
 * outlines) while also clearing dark antialiased fringes such as the 7,7,7
 * left edge of some stand bitmaps.
 */
export function clearBlackBackground(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  threshold = 12,
): void {
  const image = ctx.getImageData(0, 0, width, height);
  const data = image.data;
  const queue = new Int32Array(width * height);
  let head = 0;
  let tail = 0;

  const isBackground = (index: number): boolean => {
    const p = index * 4;
    return (
      data[p + 3] !== 0 &&
      data[p] <= threshold &&
      data[p + 1] <= threshold &&
      data[p + 2] <= threshold
    );
  };

  const push = (index: number): void => {
    if (!isBackground(index)) return;
    data[index * 4 + 3] = 0;
    queue[tail++] = index;
  };

  for (let x = 0; x < width; x++) {
    push(x);
    push((height - 1) * width + x);
  }
  for (let y = 0; y < height; y++) {
    push(y * width);
    push(y * width + width - 1);
  }

  while (head < tail) {
    const index = queue[head++];
    const x = index % width;
    const y = Math.floor(index / width);
    if (x > 0) push(index - 1);
    if (x + 1 < width) push(index + 1);
    if (y > 0) push(index - width);
    if (y + 1 < height) push(index + width);
  }

  ctx.putImageData(image, 0, 0);
}
