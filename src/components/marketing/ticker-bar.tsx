import { Check } from "lucide-react";

const ITEMS = ["Free models, one place", "Automatic retries", "No subscription"];

export function TickerBar() {
  return (
    <div className="border-y border-border/60">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-3 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
          Less friction. More curiosity.
        </p>
        <ul className="flex flex-wrap gap-x-8 gap-y-2">
          {ITEMS.map((item) => (
            <li key={item} className="flex items-center gap-2 text-sm text-muted-foreground">
              <Check className="size-3.5 shrink-0 text-brand" aria-hidden />
              {item}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
