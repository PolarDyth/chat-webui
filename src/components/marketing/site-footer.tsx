import Link from "next/link";
import { Logo } from "@/components/marketing/logo";

export function SiteFooter() {
  return (
    <footer className="border-t border-border/60">
      <div className="mx-auto w-full max-w-6xl px-6 py-12">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="flex items-center gap-2 font-semibold tracking-tight text-foreground">
              <Logo className="size-4" />
              Unwall
            </p>
            <p className="mt-2 text-sm text-muted-foreground">AI without the paywall.</p>
          </div>
          <nav className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted-foreground">
            <a href="#free-models" className="transition-colors hover:text-foreground">
              Free models
            </a>
            <a href="#how-it-works" className="transition-colors hover:text-foreground">
              How it works
            </a>
            <a href="#faq" className="transition-colors hover:text-foreground">
              FAQ
            </a>
            <Link href="/login" className="transition-colors hover:text-foreground">
              Sign in
            </Link>
          </nav>
        </div>
        <div className="mt-10 flex flex-col gap-2 border-t border-border/60 pt-4 font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground/70 sm:flex-row sm:items-center sm:justify-between">
          <p>Unwall — AI without the paywall</p>
          <a
            href="https://openrouter.ai"
            target="_blank"
            rel="noreferrer"
            className="transition-colors hover:text-foreground"
          >
            Runs on OpenRouter&rsquo;s free tier
          </a>
        </div>
      </div>
    </footer>
  );
}
