/** Apply font scale percentage to a base pixel size */
export function scaledPx(basePx: number, scalePercent: number): number {
  return Math.round(basePx * scalePercent / 100);
}
