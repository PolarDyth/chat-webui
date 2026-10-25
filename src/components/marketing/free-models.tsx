import {
  AudioLines,
  Boxes,
  Feather,
  Gem,
  Info,
  Waves,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { getTopFreeModelCards } from "@/lib/ai";
import { displayName, formatContext } from "@/components/marketing/model-format";

const CARD_ICONS: LucideIcon[] = [Feather, AudioLines, Gem, Waves, Boxes, Zap];

async function FreeModelsCatalog() {
  "use cache";
  const models = await getTopFreeModelCards(6);
  if (models.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-border/60 px-4 py-10 text-center text-sm text-muted-foreground">
        Live list unavailable right now — refresh in a bit.
      </p>
    );
  }
  return (
    <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {models.map((model, index) => {
        const Icon = CARD_ICONS[index % CARD_ICONS.length];
        return (
          <li
            key={model.id}
            className="flex flex-col justify-between gap-10 rounded-xl border border-border/60 bg-card p-4"
          >
            <div className="flex items-start justify-between">
              <span className="grid size-8 place-items-center rounded-md border border-border/60 bg-background text-muted-foreground">
                <Icon className="size-4" aria-hidden />
              </span>
              <span className="font-mono text-[10px] uppercase tracking-[0.15em] text-muted-foreground">
                Zero cost
              </span>
            </div>
            <div>
              <p className="text-sm font-medium">{displayName(model)}</p>
              <p className="mt-3 flex items-center justify-between border-t border-border/60 pt-3 font-mono text-[10px] uppercase tracking-[0.15em] text-muted-foreground">
                <span>Context window</span>
                <span className="tabular-nums text-foreground">
                  {formatContext(model.contextLength)}
                </span>
              </p>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export function FreeModels() {
  return (
    <section id="free-models" className="mx-auto w-full max-w-6xl scroll-mt-16 px-6 py-16 sm:py-24">
      <div className="mb-10 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
            01 / The free-model catalog
          </p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
            Free right now.
          </h2>
        </div>
        <p className="max-w-sm text-balance text-sm text-muted-foreground sm:text-right">
          Live from OpenRouter&rsquo;s zero-cost catalog — the same list Unwall routes to, sorted by
          context window.
        </p>
      </div>
      <FreeModelsCatalog />
      <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <Info className="size-3.5 shrink-0" aria-hidden />
          Model availability is determined by OpenRouter&rsquo;s free list.
        </p>
        <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground/70">
          Sorted by context window ↓
        </p>
      </div>
    </section>
  );
}
