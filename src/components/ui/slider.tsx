import * as React from "react";
import { cn } from "@/lib/utils";

type SliderProps = Omit<React.ComponentProps<"input">, "value" | "onChange" | "type"> & {
  value?: number[];
  onValueChange?: (value: number[]) => void;
  min?: number;
  max?: number;
  step?: number;
};

function Slider({
  className,
  value = [0],
  onValueChange,
  min = 0,
  max = 100,
  step = 1,
  ...props
}: SliderProps) {
  const current = value[0] ?? min;
  const pct = max === min ? 0 : ((current - min) / (max - min)) * 100;

  return (
    <input
      type="range"
      min={min}
      max={max}
      step={step}
      value={current}
      onChange={(event) => onValueChange?.([Number(event.target.value)])}
      className={cn("control-slider", className)}
      style={{ ["--pct" as string]: `${pct}%`, caretColor: "transparent" }}
      suppressHydrationWarning
      {...props}
    />
  );
}

export { Slider };
