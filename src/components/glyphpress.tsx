import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  Copy,
  Download,
  ImageDown,
  ImageIcon,
  SlidersHorizontal,
  Upload,
  X,
} from "lucide-react";
import { toast } from "sonner";
import {
  CHARSETS,
  convertToAscii,
  copyPngToClipboard,
  copyTextToClipboard,
  DEFAULT_SETTINGS,
  downloadBlob,
  drawAsciiToCanvas,
  exportAsciiPng,
  imageFromFile,
  loadImage,
  loadStoredSettings,
  measureCharAspect,
  revokeImage,
  storeSettings,
  type AsciiResult,
  type AsciiSettings,
  type CharsetId,
} from "@/lib/ascii";
import { SAMPLES } from "@/lib/samples";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";

type Source = {
  image: HTMLImageElement;
  name: string;
  fromSample?: string;
};

export function GlyphpressApp() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [source, setSource] = useState<Source | null>(null);
  const [settings, setSettings] = useState<AsciiSettings>(DEFAULT_SETTINGS);
  const [result, setResult] = useState<AsciiResult | null>(null);
  const [dragging, setDragging] = useState(false);
  const [copied, setCopied] = useState<"text" | "image" | null>(null);
  const [showOriginal, setShowOriginal] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [charAspect, setCharAspect] = useState(0.6);
  const seedRef = useRef<HTMLImageElement | null>(null);
  const dragDepth = useRef(0);

  useEffect(() => {
    const stored = loadStoredSettings();
    setSettings(stored);
    setHydrated(true);
  }, []);

  useEffect(() => {
    const probe = document.createElement("canvas").getContext("2d");
    if (!probe) return;
    const apply = () => setCharAspect(measureCharAspect(probe, 100));
    apply();
    void document.fonts.ready.then(apply);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    storeSettings(settings);
  }, [settings, hydrated]);

  const seedSample = useCallback((image: HTMLImageElement) => {
    if (!image.naturalWidth) return;
    setSource((prev) => prev ?? { image, name: SAMPLES[0].label, fromSample: SAMPLES[0].id });
  }, []);

  useEffect(() => {
    const el = seedRef.current;
    if (el?.complete) seedSample(el);
  }, [seedSample]);

  useEffect(() => {
    if (!source) {
      setResult(null);
      return;
    }
    const next = convertToAscii(
      source.image,
      source.image.naturalWidth || source.image.width,
      source.image.naturalHeight || source.image.height,
      settings,
      charAspect,
    );
    setResult(next);
  }, [source, settings, charAspect]);

  const adoptFile = useCallback(async (file: File) => {
    try {
      const image = await imageFromFile(file);
      setSource((prev) => {
        revokeImage(prev?.image ?? null);
        return { image, name: file.name.replace(/\.[^.]+$/, "") || "image" };
      });
      setShowOriginal(false);
      setSheetOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not read that image.");
    }
  }, []);

  const adoptSample = useCallback(async (id: string) => {
    const sample = SAMPLES.find((s) => s.id === id);
    if (!sample) return;
    try {
      const image = await loadImage(sample.src);
      setSource((prev) => {
        revokeImage(prev?.image ?? null);
        return { image, name: sample.label, fromSample: sample.id };
      });
      setShowOriginal(false);
    } catch {
      toast.error("Could not load that photo.");
    }
  }, []);

  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      const items = event.clipboardData?.items;
      if (!items) return;
      for (const item of items) {
        if (item.type.startsWith("image/")) {
          const file = item.getAsFile();
          if (file) {
            event.preventDefault();
            void adoptFile(file);
            return;
          }
        }
      }
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [adoptFile]);

  const onDragEnter = (event: React.DragEvent) => {
    event.preventDefault();
    dragDepth.current += 1;
    if (event.dataTransfer.types.includes("Files")) setDragging(true);
  };

  const onDragLeave = (event: React.DragEvent) => {
    event.preventDefault();
    dragDepth.current = Math.max(0, dragDepth.current - 1);
    if (dragDepth.current === 0) setDragging(false);
  };

  const onDragOver = (event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
  };

  const onDrop = (event: React.DragEvent) => {
    event.preventDefault();
    dragDepth.current = 0;
    setDragging(false);
    const file = event.dataTransfer.files[0];
    if (file) void adoptFile(file);
  };

  const copyText = async () => {
    if (!result?.text) return;
    try {
      await copyTextToClipboard(result.text);
      setCopied("text");
      toast.success("Copied as text.");
      window.setTimeout(() => setCopied(null), 1600);
    } catch {
      toast.error("Clipboard is blocked.");
    }
  };

  const copyImage = async () => {
    if (!result) return;
    try {
      const blob = await exportAsciiPng(result, settings);
      await copyPngToClipboard(blob);
      setCopied("image");
      toast.success("Copied as an image.");
      window.setTimeout(() => setCopied(null), 1600);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not copy the image.");
    }
  };

  const saveText = () => {
    if (!result?.text) return;
    const blob = new Blob([result.text], { type: "text/plain;charset=utf-8" });
    downloadBlob(blob, `${source?.name || "glyphpress"}.txt`);
  };

  const savePng = async () => {
    if (!result) return;
    try {
      const blob = await exportAsciiPng(result, settings);
      downloadBlob(blob, `${source?.name || "glyphpress"}.png`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not export.");
    }
  };

  const patch = <K extends keyof AsciiSettings>(key: K, value: AsciiSettings[K]) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  };

  const stats = useMemo(() => {
    if (!result) return "";
    return `${result.cols} × ${result.rows}`;
  }, [result]);

  const openFile = () => fileRef.current?.click();

  return (
    <main
      className="flex h-dvh flex-col overflow-hidden overscroll-none bg-bg text-fg"
      onDragEnter={onDragEnter}
      onDragLeave={onDragLeave}
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      <img
        ref={seedRef}
        src={SAMPLES[0].src}
        alt=""
        className="sr-only"
        onLoad={(event) => seedSample(event.currentTarget)}
      />
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="sr-only"
        aria-label="Open image"
        style={{ caretColor: "transparent" }}
        suppressHydrationWarning
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void adoptFile(file);
          event.target.value = "";
        }}
      />

      <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-border px-4 sm:px-6">
        <div className="min-w-0">
          <h1 className="font-display text-xl italic leading-none tracking-tight text-fg sm:text-2xl">
            Glyphpress
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <p className="hidden font-mono text-xs tabular-nums text-muted sm:block">
            {result ? stats : "Paste or drop"}
          </p>
          <Button type="button" variant="outline" size="sm" onClick={openFile}>
            <Upload />
            Open
          </Button>
        </div>
      </header>

      <div className="relative flex h-0 min-h-0 flex-1 flex-col overflow-hidden lg:flex-row">
        <section className="relative min-h-0 flex-1 overflow-hidden">
          {result && source ? (
            <AsciiStage
              result={result}
              source={source}
              color={settings.color}
              paper={settings.paper}
              showOriginal={showOriginal}
              onToggleOriginal={() => setShowOriginal((v) => !v)}
            />
          ) : (
            <EmptyState onOpen={openFile} onSample={adoptSample} />
          )}

          {dragging ? (
            <div className="absolute inset-0 z-20 flex items-center justify-center bg-bg/80">
              <div className="rounded-xl border border-dashed border-border-strong px-8 py-10 text-center">
                <p className="font-display text-3xl italic text-fg">Release</p>
                <p className="mt-2 font-mono text-sm text-muted">Drop to set in type</p>
              </div>
            </div>
          ) : null}
        </section>

        {sheetOpen ? (
          <button
            type="button"
            aria-label="Close controls"
            className="absolute inset-0 z-20 bg-bg/70 lg:hidden"
            onClick={() => setSheetOpen(false)}
          />
        ) : null}

        <aside
          className={cn(
            "flex min-h-0 shrink-0 flex-col bg-bg",
            "max-lg:absolute max-lg:inset-x-0 max-lg:bottom-0 max-lg:z-30 max-lg:max-h-[70dvh] max-lg:overflow-hidden max-lg:rounded-t-xl max-lg:border-t max-lg:border-border max-lg:transition-transform max-lg:duration-[var(--motion-slow)] max-lg:ease-[var(--ease-smooth-out)]",
            sheetOpen ? "max-lg:translate-y-0" : "max-lg:pointer-events-none max-lg:translate-y-full",
            "lg:relative lg:w-[300px] lg:translate-y-0 lg:overflow-hidden lg:border-l lg:border-border",
          )}
        >
          <div className="flex items-center justify-between px-4 pt-3 lg:hidden">
            <p className="font-mono text-xs uppercase tracking-widest text-muted">Adjust</p>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setSheetOpen(false)}
              aria-label="Close"
            >
              <X />
            </Button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            <Controls
              settings={settings}
              source={source}
              onPatch={patch}
              onSample={adoptSample}
              onCopyText={copyText}
              onCopyImage={copyImage}
              onSaveText={saveText}
              onSavePng={savePng}
              copied={copied}
              hasResult={Boolean(result)}
            />
          </div>
        </aside>
      </div>

      <div
        className="flex min-h-14 shrink-0 items-center gap-2 border-t border-border bg-bg px-3 pt-2 lg:hidden"
        style={{ paddingBottom: "max(0.5rem, env(safe-area-inset-bottom))" }}
      >
        <Button type="button" variant="outline" size="sm" onClick={openFile}>
          <Upload />
          Open
        </Button>
        <Button
          type="button"
          variant={sheetOpen ? "default" : "outline"}
          size="sm"
          onClick={() => setSheetOpen((v) => !v)}
          aria-expanded={sheetOpen}
        >
          <SlidersHorizontal />
          Adjust
        </Button>
        <p className="min-w-0 flex-1 truncate text-center font-mono text-xs tabular-nums text-muted">
          {result ? stats : "Drop a photo"}
        </p>
        <Button type="button" variant="outline" size="sm" onClick={copyText} disabled={!result}>
          {copied === "text" ? <Check /> : <Copy />}
          Copy
        </Button>
      </div>
    </main>
  );
}

function EmptyState({
  onOpen,
  onSample,
}: {
  onOpen: () => void;
  onSample: (id: string) => void;
}) {
  return (
    <div className="flex h-full flex-col items-center justify-center px-6 py-8">
      <div className="stagger-in mx-auto w-full max-w-md text-center">
        <p className="font-display text-4xl italic leading-tight tracking-tight text-fg sm:text-5xl">
          Set any photograph in type.
        </p>
        <p className="mt-4 font-mono text-sm leading-normal text-muted">
          Drop an image, paste from the clipboard, or open a file. Glyphpress maps light to characters.
        </p>
        <div className="mt-8 flex justify-center">
          <Button type="button" onClick={onOpen}>
            <Upload />
            Open image
          </Button>
        </div>
        <div className="mt-10 grid grid-cols-4 gap-2">
          {SAMPLES.map((sample) => (
            <button
              key={sample.id}
              type="button"
              onClick={() => onSample(sample.id)}
              className="group overflow-hidden rounded-md border border-border bg-surface text-left transition-[border-color] duration-[var(--motion-quick)] ease-[var(--ease-out)] hover:border-border-strong"
            >
              <img src={sample.src} alt="" className="aspect-square w-full object-cover" />
              <span className="sr-only">{sample.label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function AsciiStage({
  result,
  source,
  color,
  paper,
  showOriginal,
  onToggleOriginal,
}: {
  result: AsciiResult;
  source: Source;
  color: boolean;
  paper: boolean;
  showOriginal: boolean;
  onToggleOriginal: () => void;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const preRef = useRef<HTMLPreElement>(null);

  const layout = useCallback(() => {
    const wrap = wrapRef.current;
    if (!wrap || result.cols === 0) return;

    const pad = 24;
    const availW = Math.max(40, wrap.clientWidth - pad);
    const availH = Math.max(40, wrap.clientHeight - pad);
    const probe =
      canvasRef.current?.getContext("2d") ?? document.createElement("canvas").getContext("2d");
    const aspect = probe ? measureCharAspect(probe, 100) : 0.6;
    const line = 1;
    const raw = Math.min(availW / (result.cols * aspect), availH / (result.rows * line));
    const fontSize = Math.max(3.5, raw * 0.94);

    if (color && canvasRef.current) {
      drawAsciiToCanvas(canvasRef.current, result, {
        color: true,
        paper,
        cssWidth: result.cols * fontSize * aspect,
        cssHeight: result.rows * fontSize * line,
      });
    } else if (preRef.current) {
      preRef.current.style.fontSize = `${fontSize}px`;
      preRef.current.style.lineHeight = String(line);
    }
  }, [result, color, paper]);

  useEffect(() => {
    let cancelled = false;
    const run = () => {
      if (!cancelled) layout();
    };
    run();
    void document.fonts.ready.then(run);
    const wrap = wrapRef.current;
    if (!wrap) return;
    const ro = new ResizeObserver(run);
    ro.observe(wrap);
    return () => {
      cancelled = true;
      ro.disconnect();
    };
  }, [layout]);

  return (
    <div className={cn("relative flex h-full flex-col", paper ? "bg-fg" : "bg-bg")}>
      <div className="absolute right-3 top-3 z-10 flex gap-2">
        <Button
          type="button"
          size="sm"
          variant={showOriginal ? "default" : "outline"}
          onClick={onToggleOriginal}
          className={paper && !showOriginal ? "border-bg/20 text-bg hover:bg-bg/5" : undefined}
        >
          <ImageIcon />
          {showOriginal ? "Type" : "Photo"}
        </Button>
      </div>
      <div
        ref={wrapRef}
        className="flex min-h-0 flex-1 items-center justify-center overflow-hidden p-3 sm:p-4"
      >
        {showOriginal ? (
          <img
            src={source.image.src}
            alt={source.name}
            className="max-h-full max-w-full object-contain"
          />
        ) : color ? (
          <canvas ref={canvasRef} className="max-h-full max-w-full" />
        ) : (
          <pre
            ref={preRef}
            className={cn(
              "m-0 max-h-full max-w-full overflow-hidden whitespace-pre font-mono font-normal leading-none tracking-normal",
              paper ? "text-bg" : "text-fg",
            )}
          >
            {result.text}
          </pre>
        )}
      </div>
    </div>
  );
}

function Controls({
  settings,
  source,
  onPatch,
  onSample,
  onCopyText,
  onCopyImage,
  onSaveText,
  onSavePng,
  copied,
  hasResult,
}: {
  settings: AsciiSettings;
  source: Source | null;
  onPatch: <K extends keyof AsciiSettings>(key: K, value: AsciiSettings[K]) => void;
  onSample: (id: string) => void;
  onCopyText: () => void;
  onCopyImage: () => void;
  onSaveText: () => void;
  onSavePng: () => void;
  copied: "text" | "image" | null;
  hasResult: boolean;
}) {
  return (
    <div className="flex flex-col gap-6 p-4 sm:p-5">
      <section className="grid gap-3">
        <Label>Photos</Label>
        <div className="grid grid-cols-4 gap-2">
          {SAMPLES.map((sample) => {
            const active = source?.fromSample === sample.id;
            return (
              <button
                key={sample.id}
                type="button"
                onClick={() => onSample(sample.id)}
                className={cn(
                  "overflow-hidden rounded-sm border transition-[border-color] duration-[var(--motion-quick)] ease-[var(--ease-out)]",
                  active ? "border-primary" : "border-border hover:border-border-strong",
                )}
              >
                <img src={sample.src} alt="" className="aspect-square w-full object-cover" />
                <span className="sr-only">{sample.label}</span>
              </button>
            );
          })}
        </div>
      </section>

      <Separator />

      <section className="grid gap-5">
        <ControlSlider
          label="Detail"
          value={settings.columns}
          min={40}
          max={220}
          step={2}
          format={(v) => `${Math.round(v)}`}
          onChange={(v) => onPatch("columns", Math.round(v))}
        />

        <div className="grid gap-2">
          <Label htmlFor="charset">Alphabet</Label>
          <Select
            value={settings.charsetId}
            onValueChange={(value) => onPatch("charsetId", value as CharsetId)}
          >
            <SelectTrigger id="charset" aria-label="Alphabet">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CHARSETS.map((set) => (
                <SelectItem key={set.id} value={set.id}>
                  {set.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {settings.charsetId === "custom" ? (
            <Input
              value={settings.customCharset}
              onChange={(event) => onPatch("customCharset", event.target.value)}
              spellCheck={false}
              aria-label="Custom alphabet"
              placeholder="Dark → light characters"
            />
          ) : (
            <p className="truncate font-mono text-xs text-faint" aria-hidden>
              {CHARSETS.find((c) => c.id === settings.charsetId)?.chars}
            </p>
          )}
        </div>
      </section>

      <Separator />

      <section className="grid gap-4">
        <ToggleRow
          id="dither"
          label="Dither"
          checked={settings.dither}
          onCheckedChange={(v) => onPatch("dither", v)}
        />
        <ToggleRow
          id="color"
          label="Color"
          checked={settings.color}
          onCheckedChange={(v) => onPatch("color", v)}
        />
        <ToggleRow
          id="invert"
          label="Invert"
          checked={settings.invert}
          onCheckedChange={(v) => onPatch("invert", v)}
        />
        <ToggleRow
          id="paper"
          label="Paper"
          checked={settings.paper}
          onCheckedChange={(v) => onPatch("paper", v)}
        />
      </section>

      <Separator />

      <section className="grid gap-5">
        <ControlSlider
          label="Brightness"
          value={settings.brightness}
          min={-0.45}
          max={0.45}
          step={0.01}
          format={(v) => (v > 0 ? `+${v.toFixed(2)}` : v.toFixed(2))}
          onChange={(v) => onPatch("brightness", v)}
        />
        <ControlSlider
          label="Contrast"
          value={settings.contrast}
          min={0.4}
          max={2.2}
          step={0.01}
          format={(v) => v.toFixed(2)}
          onChange={(v) => onPatch("contrast", v)}
        />
      </section>

      <Separator />

      <section className="grid gap-2">
        <Label>Export</Label>
        <div className="grid grid-cols-2 gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onCopyText}
            disabled={!hasResult}
          >
            {copied === "text" ? <Check /> : <Copy />}
            Copy text
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onCopyImage}
            disabled={!hasResult}
          >
            {copied === "image" ? <Check /> : <ImageDown />}
            Copy image
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={onSaveText} disabled={!hasResult}>
            <Download />
            Save text
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={onSavePng} disabled={!hasResult}>
            <ImageDown />
            Save image
          </Button>
        </div>
      </section>
    </div>
  );
}

function ControlSlider({
  label,
  value,
  min,
  max,
  step,
  format,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format: (value: number) => string;
  onChange: (value: number) => void;
}) {
  return (
    <div className="grid gap-2">
      <div className="flex items-baseline justify-between gap-3">
        <Label>{label}</Label>
        <span className="font-mono text-xs tabular-nums text-muted">{format(value)}</span>
      </div>
      <Slider
        min={min}
        max={max}
        step={step}
        value={[value]}
        onValueChange={(vals) => onChange(vals[0] ?? value)}
        aria-label={label}
      />
    </div>
  );
}

function ToggleRow({
  id,
  label,
  checked,
  onCheckedChange,
}: {
  id: string;
  label: string;
  checked: boolean;
  onCheckedChange: (value: boolean) => void;
}) {
  return (
    <div className="flex h-11 items-center justify-between gap-3">
      <Label htmlFor={id} className="cursor-pointer">
        {label}
      </Label>
      <Switch id={id} checked={checked} onCheckedChange={onCheckedChange} />
    </div>
  );
}
