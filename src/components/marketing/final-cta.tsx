import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/marketing/logo";

export function FinalCta() {
  return (
    <section className="relative overflow-hidden bg-banner text-banner-foreground">
      {/* Element opacity (not an alpha stroke color) — the mark's two paths
          overlap at the bottom, and alpha strokes would double-darken there. */}
      <Logo className="pointer-events-none absolute -right-20 top-1/2 hidden size-[28rem] -translate-y-1/2 text-banner-foreground opacity-25 sm:block lg:-right-16 lg:size-[34rem]" />
      <div className="relative mx-auto flex w-full max-w-6xl flex-col items-start gap-6 px-6 py-20 sm:py-28">
        <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-banner-foreground/70">
          No subscription. No credit card.
        </p>
        <h2 className="text-4xl font-semibold tracking-tight sm:text-6xl sm:leading-[1.05]">
          Your next question.
          <span className="block">Not your next bill.</span>
        </h2>
        <Button
          size="lg"
          asChild
          className="bg-banner-foreground text-banner hover:bg-banner-foreground/85"
        >
          <Link href="/login">
            Start chatting free
            <ArrowUpRight data-icon="inline-end" />
          </Link>
        </Button>
      </div>
    </section>
  );
}
