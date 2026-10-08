export const CHARSETS = [
  { id: "standard", label: "Standard", chars: " .:-=+*#%@" },
  { id: "dense", label: "Dense", chars: " .'`^\",:;Il!i><~+_-?][}{1)(|\\/tfjrxnuvczXYUJCLQ0OZmwqpdbkhao*#MW&8%B@$" },
  { id: "braille", label: "Braille", chars: "⠀⠁⠃⠇⡇⣇⣤⣿" },
  { id: "blocks", label: "Blocks", chars: " ░▒▓█" },
  { id: "simple", label: "Simple", chars: " .:░▒▓█" },
  { id: "binary", label: "Binary", chars: " █" },
  { id: "dots", label: "Dots", chars: " ·•●" },
  { id: "hash", label: "Hash", chars: " .:+=#" },
  { id: "custom", label: "Custom", chars: "" },
] as const;

export type CharsetId = (typeof CHARSETS)[number]["id"];

export type AsciiSettings = {
  columns: number;
  charsetId: CharsetId;
  customCharset: string;
  invert: boolean;
  color: boolean;
  dither: boolean;
  brightness: number;
  contrast: number;
  paper: boolean;
};

export const DEFAULT_SETTINGS: AsciiSettings = {
  columns: 110,
  charsetId: "standard",
  customCharset: " .:-=+*#%@",
  invert: false,
  color: false,
  dither: true,
  brightness: 0,
  contrast: 1.08,
  paper: false,
};

export const SETTINGS_KEY = "glyphpress:settings";

export type AsciiResult = {
  text: string;
  lines: string[];
  rows: number;
  cols: number;
  colors?: string[][];
};

const INK = "#0c0b09";
const PAPER = "#ece7db";
const FONT_STACK = '"IBM Plex Mono", ui-monospace, "Cascadia Code", monospace';
const DEFAULT_ASPECT = 0.6;
const BRAILLE_ORIGIN = 0x2800;
const BRAILLE_DOTS = [
  [0x01, 0x08],
  [0x02, 0x10],
  [0x04, 0x20],
  [0x40, 0x80],
] as const;

export function resolveCharset(settings: AsciiSettings): string {
  if (settings.charsetId === "custom") {
    const custom = settings.customCharset.replace(/\n/g, "");
    return custom.length > 0 ? custom : " .:-=+*#%@";
  }
  const found = CHARSETS.find((c) => c.id === settings.charsetId);
  return found?.chars || CHARSETS[0].chars;
}

function luminance(r: number, g: number, b: number): number {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = "async";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Could not read that image."));
    img.src = src;
  });
}

export function imageFromFile(file: File): Promise<HTMLImageElement> {
  if (!file.type.startsWith("image/")) {
    return Promise.reject(new Error("That file is not an image."));
  }
  const url = URL.createObjectURL(file);
  return loadImage(url).then((img) => {
    (img as HTMLImageElement & { _objectUrl?: string })._objectUrl = url;
    return img;
  });
}

export function revokeImage(img: HTMLImageElement | null) {
  const url = (img as (HTMLImageElement & { _objectUrl?: string }) | null)?._objectUrl;
  if (url) URL.revokeObjectURL(url);
}

/** Character cell width / font-size for IBM Plex Mono. */
export function measureCharAspect(ctx: CanvasRenderingContext2D, fontSize = 100): number {
  ctx.font = `${fontSize}px ${FONT_STACK}`;
  const width = ctx.measureText("M").width;
  return width > 0 ? width / fontSize : DEFAULT_ASPECT;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function gridSize(
  sourceWidth: number,
  sourceHeight: number,
  columns: number,
  charAspect: number,
): { cols: number; rows: number } {
  const cols = Math.round(clamp(columns, 8, 280));
  const imgAspect = sourceWidth / Math.max(1, sourceHeight);
  const rows = Math.max(4, Math.round((cols / imgAspect) * charAspect));
  return { cols, rows };
}

function rasterize(
  image: CanvasImageSource,
  width: number,
  height: number,
  paper: boolean,
): ImageData | null {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  ctx.fillStyle = paper ? PAPER : INK;
  ctx.fillRect(0, 0, width, height);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(image, 0, 0, width, height);
  return ctx.getImageData(0, 0, width, height);
}

function toneMap(y: number, settings: AsciiSettings, flip: boolean): number {
  let t = (y - 0.5) * settings.contrast + 0.5 + settings.brightness;
  t = clamp(t, 0, 1);
  t = Math.pow(t, 0.88);
  if (flip) t = 1 - t;
  return t * 255;
}

function floydSteinberg(lum: Float32Array, cols: number, rows: number, last: number) {
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const i = y * cols + x;
      const old = lum[i] ?? 0;
      const t = clamp(old / 255, 0, 1);
      const idx = Math.min(last, Math.max(0, Math.round(t * last)));
      const next = last === 0 ? 0 : (idx / last) * 255;
      const err = old - next;
      lum[i] = next;
      if (x + 1 < cols) lum[i + 1] = (lum[i + 1] ?? 0) + err * (7 / 16);
      if (y + 1 < rows) {
        if (x > 0) lum[i + cols - 1] = (lum[i + cols - 1] ?? 0) + err * (3 / 16);
        lum[i + cols] = (lum[i + cols] ?? 0) + err * (5 / 16);
        if (x + 1 < cols) lum[i + cols + 1] = (lum[i + cols + 1] ?? 0) + err * (1 / 16);
      }
    }
  }
}

function sampleGrid(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  settings: AsciiSettings,
): { lum: Float32Array; rgb: Uint8ClampedArray | null } {
  const count = width * height;
  const lum = new Float32Array(count);
  const rgb = settings.color ? new Uint8ClampedArray(count * 3) : null;
  const flip = settings.paper !== settings.invert;

  for (let i = 0; i < count; i++) {
    const o = i * 4;
    const r = data[o] ?? 0;
    const g = data[o + 1] ?? 0;
    const b = data[o + 2] ?? 0;
    lum[i] = toneMap(luminance(r, g, b) / 255, settings, flip);
    if (rgb) {
      rgb[i * 3] = r;
      rgb[i * 3 + 1] = g;
      rgb[i * 3 + 2] = b;
    }
  }
  return { lum, rgb };
}

function convertRamp(
  data: Uint8ClampedArray,
  cols: number,
  rows: number,
  settings: AsciiSettings,
): AsciiResult {
  const charset = resolveCharset(settings);
  const last = charset.length - 1;
  const { lum, rgb } = sampleGrid(data, cols, rows, settings);

  if (settings.dither && last > 0) {
    floydSteinberg(lum, cols, rows, last);
  }

  const pick = (value: number): number => {
    const t = clamp(value / 255, 0, 1);
    return Math.min(last, Math.max(0, Math.round(t * last)));
  };

  const lines: string[] = [];
  const colorRows: string[][] | undefined = rgb ? [] : undefined;

  for (let y = 0; y < rows; y++) {
    let line = "";
    const colorRow: string[] = [];
    for (let x = 0; x < cols; x++) {
      const i = y * cols + x;
      line += charset[pick(lum[i] ?? 0)];
      if (rgb && colorRows) {
        colorRow.push(`rgb(${rgb[i * 3]},${rgb[i * 3 + 1]},${rgb[i * 3 + 2]})`);
      }
    }
    lines.push(line);
    colorRows?.push(colorRow);
  }

  return { text: lines.join("\n"), lines, rows, cols, colors: colorRows };
}

function convertBraille(
  data: Uint8ClampedArray,
  cols: number,
  rows: number,
  settings: AsciiSettings,
): AsciiResult {
  const pw = cols * 2;
  const ph = rows * 4;
  const { lum, rgb } = sampleGrid(data, pw, ph, settings);

  if (settings.dither) {
    floydSteinberg(lum, pw, ph, 1);
  }

  const lines: string[] = [];
  const colorRows: string[][] | undefined = rgb ? [] : undefined;

  for (let y = 0; y < rows; y++) {
    let line = "";
    const colorRow: string[] = [];
    for (let x = 0; x < cols; x++) {
      let bits = 0;
      let rSum = 0;
      let gSum = 0;
      let bSum = 0;
      for (let dy = 0; dy < 4; dy++) {
        for (let dx = 0; dx < 2; dx++) {
          const px = x * 2 + dx;
          const py = y * 4 + dy;
          const i = py * pw + px;
          const on = (lum[i] ?? 0) >= 128;
          if (on) {
            const row = BRAILLE_DOTS[dy];
            const bit = row?.[dx] ?? 0;
            bits |= bit;
          }
          if (rgb) {
            rSum += rgb[i * 3] ?? 0;
            gSum += rgb[i * 3 + 1] ?? 0;
            bSum += rgb[i * 3 + 2] ?? 0;
          }
        }
      }
      line += String.fromCharCode(BRAILLE_ORIGIN + bits);
      if (rgb && colorRows) {
        colorRow.push(
          `rgb(${Math.round(rSum / 8)},${Math.round(gSum / 8)},${Math.round(bSum / 8)})`,
        );
      }
    }
    lines.push(line);
    colorRows?.push(colorRow);
  }

  return { text: lines.join("\n"), lines, rows, cols, colors: colorRows };
}

export function convertToAscii(
  image: CanvasImageSource,
  sourceWidth: number,
  sourceHeight: number,
  settings: AsciiSettings,
  charAspect = DEFAULT_ASPECT,
): AsciiResult {
  const aspect = charAspect > 0.2 && charAspect < 1 ? charAspect : DEFAULT_ASPECT;
  const { cols, rows } = gridSize(sourceWidth, sourceHeight, settings.columns, aspect);
  const braille = settings.charsetId === "braille";
  const sampled = rasterize(
    image,
    braille ? cols * 2 : cols,
    braille ? rows * 4 : rows,
    settings.paper,
  );
  if (!sampled) {
    return { text: "", lines: [], rows: 0, cols: 0 };
  }
  return braille
    ? convertBraille(sampled.data, cols, rows, settings)
    : convertRamp(sampled.data, cols, rows, settings);
}

export function drawAsciiToCanvas(
  canvas: HTMLCanvasElement,
  result: AsciiResult,
  options: {
    color: boolean;
    paper: boolean;
    cssWidth: number;
    cssHeight: number;
    dpr?: number;
  },
) {
  const dpr = options.dpr ?? Math.min(2, typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1);
  const ctx = canvas.getContext("2d");
  if (!ctx || result.cols === 0 || result.rows === 0) return;

  const cssW = Math.max(1, options.cssWidth);
  const cssH = Math.max(1, options.cssHeight);
  canvas.width = Math.ceil(cssW * dpr);
  canvas.height = Math.ceil(cssH * dpr);
  canvas.style.width = `${cssW}px`;
  canvas.style.height = `${cssH}px`;

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const bg = options.paper ? PAPER : INK;
  const fg = options.paper ? INK : PAPER;
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, cssW, cssH);

  const cellW = cssW / result.cols;
  const cellH = cssH / result.rows;
  const fontSize = Math.max(1, cellH);
  ctx.font = `${fontSize}px ${FONT_STACK}`;
  ctx.textBaseline = "top";
  ctx.textAlign = "left";
  ctx.imageSmoothingEnabled = false;

  for (let y = 0; y < result.rows; y++) {
    const line = result.lines[y] ?? "";
    for (let x = 0; x < result.cols; x++) {
      const ch = line[x];
      if (!ch || ch === " " || ch === "⠀") continue;
      if (options.color && result.colors) {
        ctx.fillStyle = result.colors[y]?.[x] ?? fg;
      } else {
        ctx.fillStyle = fg;
      }
      ctx.fillText(ch, x * cellW, y * cellH);
    }
  }
}

export function exportAsciiPng(result: AsciiResult, settings: AsciiSettings): Promise<Blob> {
  const fontSize = 16;
  const probe = document.createElement("canvas").getContext("2d");
  const aspect = probe ? measureCharAspect(probe, fontSize) : DEFAULT_ASPECT;
  const cellW = fontSize * aspect;
  const cellH = fontSize;
  const canvas = document.createElement("canvas");
  drawAsciiToCanvas(canvas, result, {
    color: settings.color,
    paper: settings.paper,
    cssWidth: result.cols * cellW,
    cssHeight: result.rows * cellH,
    dpr: 2,
  });
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("Could not export the image."));
    }, "image/png");
  });
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export async function copyTextToClipboard(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return;
  } catch {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.left = "-9999px";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    ta.remove();
    if (!ok) throw new Error("Clipboard is blocked.");
  }
}

export async function copyPngToClipboard(blob: Blob) {
  if (typeof ClipboardItem === "undefined" || !navigator.clipboard?.write) {
    throw new Error("Copying images is not supported here.");
  }
  await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
}

export function loadStoredSettings(): AsciiSettings {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;
  try {
    const raw = window.localStorage.getItem(SETTINGS_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<AsciiSettings>;
    const charsetId = CHARSETS.some((c) => c.id === parsed.charsetId)
      ? (parsed.charsetId as CharsetId)
      : DEFAULT_SETTINGS.charsetId;
    return { ...DEFAULT_SETTINGS, ...parsed, charsetId };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function storeSettings(settings: AsciiSettings) {
  try {
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // ignore quota
  }
}
