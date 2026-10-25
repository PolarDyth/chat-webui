import { MessageSquare, RefreshCw, Route, type LucideIcon } from "lucide-react";

const STEPS: { icon: LucideIcon; title: string; body: string; tag: string }[] = [
  {
    icon: MessageSquare,
    title: "You ask.",
    body: "Start with a question. Unwall takes care of finding a free model to answer it.",
    tag: "Your question",
  },
  {
    icon: Route,
    title: "Unwall routes.",
    body: "Your question goes to the best free model on OpenRouter. No model pricing required.",
    tag: "The best free model",
  },
  {
    icon: RefreshCw,
    title: "The next model steps in.",
    body: "If a model is rate-limited, Unwall quietly retries the next one. Less interruption, same question.",
    tag: "Automatic retries",
  },
];

export function HowItWorks() {
  return (
    <section
      id="how-it-works"
      className="mx-auto w-full max-w-6xl scroll-mt-16 px-6 py-16 sm:py-24"
    >
      <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
        02 / How it works
      </p>
      <h2 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
        One question. A smarter route.
      </h2>
      <ol className="mt-12 grid gap-10 sm:grid-cols-3 sm:gap-6">
        {STEPS.map((step, index) => (
          <li key={step.title} className="flex flex-col gap-4">
            <div className="flex items-center gap-4">
              <span className="grid size-10 shrink-0 place-items-center rounded-lg border border-border/60 bg-card">
                <step.icon className="size-4 text-brand" aria-hidden />
              </span>
              <span className="h-px flex-1 bg-border" aria-hidden />
              <span className="font-mono text-xs tabular-nums text-muted-foreground">
                0{index + 1}
              </span>
            </div>
            <h3 className="font-medium">{step.title}</h3>
            <p className="text-sm text-muted-foreground">{step.body}</p>
            <p className="mt-auto font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground/70">
              {step.tag}
            </p>
          </li>
        ))}
      </ol>
    </section>
  );
}
