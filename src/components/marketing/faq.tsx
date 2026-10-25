"use client";

import { Minus, Plus } from "lucide-react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

const FAQS = [
  {
    q: "Is Unwall really free?",
    a: "Yes. Unwall runs on OpenRouter's free tier and routes to its zero-cost catalog — no subscription, no credit card. If you ever want paid models, paste your own OpenRouter key in Settings; Unwall adds nothing to the price.",
  },
  {
    q: "What happens when a model is rate-limited?",
    a: "Unwall quietly retries the next model on OpenRouter rather than stopping at the first limit. The fallback chain runs routed model → your default → the top free models, and the answer notes when it fell back.",
  },
  {
    q: "Which models does Unwall use?",
    a: "The free models shown in the catalog above — it's the same list Unwall routes to, sorted by context window. With your own key, any model OpenRouter offers, including premium ones.",
  },
  {
    q: "Does free mean there are no limits?",
    a: "Free models can still be rate-limited. Automatic retries help Unwall find another free model when that happens.",
  },
];

export function Faq() {
  return (
    <section id="faq" className="mx-auto w-full max-w-6xl scroll-mt-16 px-6 py-16 sm:py-24">
      <div className="grid gap-10 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] lg:gap-16">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
            04 / More answers
          </p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
            A little more clarity.
          </h2>
          <p className="mt-4 max-w-xs text-sm text-muted-foreground">
            The essentials before your first question.
          </p>
        </div>
        <div className="flex flex-col gap-2">
          {FAQS.map(({ q, a }, index) => (
            <Collapsible
              key={q}
              defaultOpen={index === 0}
              className="rounded-xl border border-transparent px-4 transition-colors hover:bg-muted/30 data-[state=open]:border-border/60 data-[state=open]:bg-muted/50"
            >
              <CollapsibleTrigger className="group flex w-full items-center justify-between gap-4 py-4 text-left text-sm font-medium">
                {q}
                <span className="grid size-6 shrink-0 place-items-center rounded-full border border-border/60 text-muted-foreground">
                  <Plus className="size-3 group-data-[state=open]:hidden" aria-hidden />
                  <Minus className="hidden size-3 group-data-[state=open]:block" aria-hidden />
                </span>
              </CollapsibleTrigger>
              <CollapsibleContent className="pb-4 text-sm text-muted-foreground">
                {a}
              </CollapsibleContent>
            </Collapsible>
          ))}
        </div>
      </div>
    </section>
  );
}
