import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { RouterDemo } from "@/components/marketing/router-demo";
import { getTopFreeModelCards } from "@/lib/ai";
import { displayName } from "@/components/marketing/model-format";

const FALLBACK_DEMO_MODELS: [string, string] = ["Inkling Small (free)", "Inkling (free)"];

export async function Hero() {
  "use cache";
  const cards = await getTopFreeModelCards(2);
  const models: [string, string] =
    cards.length >= 2 ? [displayName(cards[0]), displayName(cards[1])] : FALLBACK_DEMO_MODELS;

  return (
    <section className="mx-auto w-full max-w-6xl px-6 pb-16 pt-12 sm:pb-24 sm:pt-16 lg:pt-24">
      <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-14">
        <div className="flex flex-col items-start gap-6">
          <p className="flex items-center gap-2.5 font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
            <span className="size-1.5 rounded-full bg-brand" aria-hidden />
            Runs on OpenRouter&rsquo;s free tier
          </p>
          <h1 className="text-4xl font-semibold tracking-tight sm:text-6xl sm:leading-[1.05]">
            AI without <span className="block text-brand">the paywall.</span>
          </h1>
          <p className="max-w-lg text-balance text-muted-foreground sm:text-lg">
            Unwall routes every question to the best free model on OpenRouter — and quietly retries
            the next one when a model is rate-limited. No subscription. No credit card.
          </p>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Button size="lg" asChild className="bg-brand text-brand-foreground hover:bg-brand/85">
              <Link href="/login">
                Start chatting free
                <ArrowUpRight data-icon="inline-end" />
              </Link>
            </Button>
            <Button size="lg" variant="outline" asChild>
              <a href="#free-models">
                See the free models
                <ArrowUpRight data-icon="inline-end" />
              </a>
            </Button>
          </div>
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground/70">
            No subscription. No credit card.
          </p>
        </div>
        <RouterDemo models={models} />
      </div>
    </section>
  );
}
