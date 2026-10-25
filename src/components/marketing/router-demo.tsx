"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Check, CircleAlert, Expand, Loader2, Route } from "lucide-react";

/** Hydration gate without an effect: the server snapshot renders the routing
 *  state; after hydration the client snapshot flips, letting reduced-motion
 *  users see the finished flow without an SSR/client mismatch. */
const subscribeToNothing = () => () => {};
const useHydrated = () =>
  useSyncExternalStore(
    subscribeToNothing,
    () => true,
    () => false,
  );

type DemoStep = "routing" | "limited" | "responding" | "answered";

const STEP_MS: Record<DemoStep, number> = {
  routing: 1400,
  limited: 1800,
  responding: 1600,
  answered: 5200,
};

const NEXT_STEP: Record<DemoStep, DemoStep> = {
  routing: "limited",
  limited: "responding",
  responding: "answered",
  answered: "routing",
};

const QUESTION = "Why does the sky change color at sunset?";
const ANSWER =
  "At sunset, sunlight travels through more of the atmosphere. Blue light scatters away, leaving the warm reds and oranges you see.";

const CHIP =
  "inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.15em]";

export function RouterDemo({ models }: { models: [string, string] }) {
  const [step, setStep] = useState<DemoStep>("routing");
  const hydrated = useHydrated();
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    if (!hydrated || reducedMotion) return;
    const timer = setTimeout(() => setStep(NEXT_STEP[step]), STEP_MS[step]);
    return () => clearTimeout(timer);
  }, [step, hydrated, reducedMotion]);

  // Reduced motion skips the loop and shows the finished flow, as drawn.
  const settled = !hydrated ? "routing" : reducedMotion ? "answered" : step;
  const [first, second] = models;

  return (
    <div
      role="img"
      aria-label="Illustration of Unwall's automatic retry: the first free model is rate-limited, so Unwall routes the same question to the next free model, which answers."
      className="rounded-2xl border border-border/60 bg-card p-5 shadow-sm"
    >
      <div aria-hidden className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-border" />
            <span className="size-2 rounded-full bg-border" />
            <span className="size-2 rounded-full bg-border" />
          </div>
          <p className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.15em] text-muted-foreground/70">
            Demo / Chatting prompt
            <Expand className="size-3" />
          </p>
        </div>

        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.15em] text-muted-foreground/70">
            Your question
          </p>
          <p className="mt-1.5 rounded-lg border border-border/60 bg-background px-3.5 py-3 text-sm">
            {QUESTION}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <span className="h-px flex-1 bg-border" />
          <span className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-background px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.15em] text-muted-foreground">
            <Route className="size-3" />
            Unwall router
          </span>
          <span className="h-px flex-1 bg-border" />
        </div>

        <div className="flex min-h-52 flex-col gap-2">
          <div className="rounded-lg border border-border/60 bg-background px-3.5 py-3 transition-colors">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                {settled === "routing" ? (
                  <Loader2 className="size-4 animate-spin text-muted-foreground" />
                ) : (
                  <CircleAlert className="size-4 text-amber-500 dark:text-amber-400" />
                )}
                <span className="text-sm font-medium">{first}</span>
              </div>
              {settled === "routing" ? (
                <span className={`${CHIP} text-muted-foreground`}>
                  <Loader2 className="size-3 animate-spin" />
                  Routing
                </span>
              ) : (
                <span className={`${CHIP} text-amber-500 dark:text-amber-400`}>Rate-limited</span>
              )}
            </div>
            {settled !== "routing" && (
              <p className="mt-2 font-mono text-[10px] tracking-[0.1em] text-muted-foreground/70">
                → Queuing. Trying the next model…
              </p>
            )}
          </div>

          <AnimatePresence>
            {(settled === "responding" || settled === "answered") && (
              <motion.div
                key="second-model"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.4, ease: "easeOut" }}
                className="rounded-lg border border-brand/40 bg-brand/10 px-3.5 py-3"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    {settled === "responding" ? (
                      <Loader2 className="size-4 animate-spin text-brand" />
                    ) : (
                      <Check className="size-4 text-brand" />
                    )}
                    <span className="text-sm font-medium">{second}</span>
                  </div>
                  <span className={`${CHIP} text-brand`}>
                    {settled === "responding" && (
                      <span className="size-1.5 animate-pulse rounded-full bg-current" />
                    )}
                    Responding
                  </span>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <AnimatePresence>
            {settled === "answered" && (
              <motion.div
                key="answer"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.4, ease: "easeOut" }}
                className="rounded-lg border border-border/60 bg-background px-3.5 py-3"
              >
                <p className="font-mono text-[10px] uppercase tracking-[0.15em] text-brand">
                  {second}
                </p>
                <p className="mt-1.5 text-sm text-muted-foreground">{ANSWER}</p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div className="flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.15em] text-muted-foreground/70">
          <span>Illustrative retry flow</span>
          <span>Powered by OpenRouter</span>
        </div>
      </div>
    </div>
  );
}
