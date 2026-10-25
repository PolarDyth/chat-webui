import { SiteHeader } from "@/components/marketing/site-header";
import { Hero } from "@/components/marketing/hero";
import { TickerBar } from "@/components/marketing/ticker-bar";
import { FreeModels } from "@/components/marketing/free-models";
import { HowItWorks } from "@/components/marketing/how-it-works";
import { ValueProps } from "@/components/marketing/value-props";
import { Faq } from "@/components/marketing/faq";
import { FinalCta } from "@/components/marketing/final-cta";
import { SiteFooter } from "@/components/marketing/site-footer";

export default function LandingPage() {
  return (
    <div className="flex min-h-svh flex-col">
      <SiteHeader />
      <main className="flex-1">
        <Hero />
        <TickerBar />
        <FreeModels />
        <HowItWorks />
        <ValueProps />
        <Faq />
        <FinalCta />
      </main>
      <SiteFooter />
    </div>
  );
}
