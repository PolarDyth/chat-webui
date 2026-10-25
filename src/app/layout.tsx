import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import "katex/dist/katex.min.css";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://unwall.it"),
  title: "Unwall — AI without the paywall",
  description:
    "Chat across the best free models on OpenRouter. No subscription, no credit card — bring your own key only if you want premium models.",
  openGraph: {
    title: "Unwall — AI without the paywall",
    description:
      "Chat across the best free models on OpenRouter. No subscription, no credit card.",
    url: "/",
    siteName: "Unwall",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Unwall — AI without the paywall",
    description:
      "Chat across the best free models on OpenRouter. No subscription, no credit card.",
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col">
        <ThemeProvider>
          <TooltipProvider delayDuration={200}>{children}</TooltipProvider>
          <Toaster position="bottom-right" />
        </ThemeProvider>
      </body>
    </html>
  );
}
