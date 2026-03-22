/** Convert hex (#rrggbb) to HSL [h, s, l] where h=0-360, s/l=0-1 */
function hexToHsl(hex: string): [number, number, number] {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;
  return [h * 360, s, l];
}

/** Convert HSL to hex (#rrggbb) */
function hslToHex(h: number, s: number, l: number): string {
  const hue2rgb = (p: number, q: number, t: number) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  h /= 360;
  if (s === 0) {
    const v = Math.round(l * 255);
    return `#${v.toString(16).padStart(2, '0').repeat(3)}`;
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const r = Math.round(hue2rgb(p, q, h + 1 / 3) * 255);
  const g = Math.round(hue2rgb(p, q, h) * 255);
  const b = Math.round(hue2rgb(p, q, h - 1 / 3) * 255);
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

/**
 * Generate 10 shades (50-900) from a single hex color, keyed by shade number.
 * The input color is anchored at shade 500. Lighter shades go toward white,
 * darker shades go toward black, using the input's actual lightness as center.
 */
export function generatePalette(hex: string): Record<string, string> {
  const [h, s, inputL] = hexToHsl(hex);

  // Shade positions: 0 = lightest (50), 1 = darkest (900)
  // 500 is at position 0.5 (the anchor point)
  const shadePositions: [string, number][] = [
    ['50', 0.0], ['100', 0.1], ['200', 0.2], ['300', 0.3], ['400', 0.4],
    ['500', 0.5], ['600', 0.6], ['700', 0.7], ['800', 0.8], ['900', 0.9],
  ];

  const palette: Record<string, string> = {};
  for (const [shade, pos] of shadePositions) {
    let lightness: number;
    if (pos <= 0.5) {
      // Lighter than anchor: interpolate from 0.95 to inputL
      lightness = 0.95 - (0.95 - inputL) * (pos / 0.5);
    } else {
      // Darker than anchor: interpolate from inputL to 0.05
      lightness = inputL - (inputL - 0.05) * ((pos - 0.5) / 0.5);
    }
    palette[shade] = hslToHex(h, s, lightness);
  }
  return palette;
}
