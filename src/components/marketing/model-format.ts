import type { FreeModelCard } from "@/lib/ai";

export function formatContext(tokens: number): string {
  if (tokens >= 1_000_000) return `${Math.round(tokens / 1_000_000)}M context`;
  if (tokens >= 1_000) return `${Math.round(tokens / 1_000)}K context`;
  return `${tokens} context`;
}

/** "Vendor: Model Name (free)" → "Model Name"; vendor and suffix are noise. */
export function displayName(model: FreeModelCard): string {
  const withoutVendor = model.name.split(":").slice(1).join(":").trim();
  return (withoutVendor || model.name).replace(/\s*\((?:free)\)\s*$/i, "");
}
