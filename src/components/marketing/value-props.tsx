import { CreditCard, IterationCw, Layers, type LucideIcon } from "lucide-react";

const ITEMS: { icon: LucideIcon; title: string; body: string }[] = [
  {
    icon: CreditCard,
    title: "No subscription. No credit card.",
    body: "Unwall runs on OpenRouter's free tier. Start chatting without a paid plan.",
  },
  {
    icon: Layers,
    title: "Less model management.",
    body: "The free-model catalog is brought together in one place. Unwall handles the routing.",
  },
  {
    icon: IterationCw,
    title: "A fallback, not a dead end.",
    body: "A rate-limited model doesn't have to be your last stop. Unwall automatically tries the next one.",
  },
];

export function ValueProps() {
  return (
    <section className="mx-auto w-full max-w-6xl px-6 py-16 sm:py-24">
      <div className="grid gap-12 lg:grid-cols-2 lg:gap-16">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
            03 / Built around your question
          </p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
            Keep the curiosity.
            <span className="block text-brand">Lose the paywall.</span>
          </h2>
          <p className="mt-4 max-w-sm text-balance text-sm text-muted-foreground sm:text-base">
            A simpler way to reach free AI. Ask your question, without turning it into a
            subscription decision.
          </p>
        </div>
        <ul className="divide-y divide-border/60">
          {ITEMS.map((item) => (
            <li key={item.title} className="flex gap-4 py-5 first:pt-0 last:pb-0">
              <item.icon className="mt-0.5 size-4 shrink-0 text-brand" aria-hidden />
              <div>
                <h3 className="text-sm font-medium">{item.title}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{item.body}</p>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
