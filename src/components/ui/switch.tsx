import * as React from "react";
import { cn } from "@/lib/utils";

type SwitchProps = {
  checked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
  id?: string;
  className?: string;
  disabled?: boolean;
};

function Switch({ checked = false, onCheckedChange, id, className, disabled }: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      id={id}
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onCheckedChange?.(!checked)}
      className={cn(
        "inline-flex h-6 w-10 shrink-0 items-center rounded-full border border-border-strong transition-[background-color,border-color] duration-[var(--motion-quick)] ease-[var(--ease-out)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 disabled:cursor-not-allowed disabled:opacity-40",
        checked ? "bg-primary" : "bg-surface-2",
        className,
      )}
    >
      <span
        aria-hidden
        className={cn(
          "block size-4 rounded-full transition-transform duration-[var(--motion-quick)] ease-[var(--ease-out)]",
          checked ? "translate-x-[18px] bg-primary-fg" : "translate-x-0.5 bg-fg",
        )}
      />
    </button>
  );
}

export { Switch };
