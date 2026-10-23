'use client';

import { useMemo, useState } from 'react';
import { Check, ChevronsUpDown, Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  ModelSelector,
  ModelSelectorContent,
  ModelSelectorEmpty,
  ModelSelectorGroup,
  ModelSelectorInput,
  ModelSelectorItem,
  ModelSelectorList,
  ModelSelectorLogo,
  ModelSelectorName,
  ModelSelectorTrigger,
} from '@/components/ai-elements/model-selector';
import { formatCost } from '@/lib/format';
import type { OpenRouterModel } from '@/lib/types';

function providerOf(modelId: string): string {
  return modelId.split('/')[0] ?? 'other';
}

/** USD per 1M tokens, for the picker badge. */
function pricePerMillion(model: OpenRouterModel): string | null {
  const prompt = Number(model.promptPrice);
  if (!Number.isFinite(prompt)) return null;
  if (prompt === 0) return 'free';
  const completion = Number(model.completionPrice) || 0;
  return `$${(prompt * 1_000_000).toFixed(2)} in / $${(completion * 1_000_000).toFixed(2)} out per 1M`;
}

export function ModelPicker({
  models,
  loading,
  value,
  onSelect,
  triggerClassName,
  placeholder = 'Select model…',
}: {
  models: OpenRouterModel[];
  loading?: boolean;
  value?: string | null;
  onSelect: (modelId: string) => void;
  triggerClassName?: string;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);

  const grouped = useMemo(() => {
    const byProvider = new Map<string, OpenRouterModel[]>();
    for (const model of models) {
      const provider = providerOf(model.id);
      const list = byProvider.get(provider) ?? [];
      list.push(model);
      byProvider.set(provider, list);
    }
    return [...byProvider.entries()];
  }, [models]);

  const selected = models.find((m) => m.id === value);

  return (
    <ModelSelector open={open} onOpenChange={setOpen}>
      <ModelSelectorTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={triggerClassName}
        >
          {loading ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <ModelSelectorName className="truncate">
              {selected ? selected.name : placeholder}
            </ModelSelectorName>
          )}
          <ChevronsUpDown className="size-4 shrink-0 opacity-50" />
        </Button>
      </ModelSelectorTrigger>
      <ModelSelectorContent>
        <ModelSelectorInput placeholder="Search models…" />
        <ModelSelectorList>
          <ModelSelectorEmpty>
            {loading ? 'Loading models…' : 'No models found.'}
          </ModelSelectorEmpty>
          {grouped.map(([provider, providerModels]) => (
            <ModelSelectorGroup key={provider} heading={provider}>
              {providerModels.map((model) => (
                <ModelSelectorItem
                  key={model.id}
                  value={`${model.name} ${model.id}`}
                  onSelect={() => {
                    onSelect(model.id);
                    setOpen(false);
                  }}
                >
                  <ModelSelectorLogo
                    provider={provider}
                    onError={(e) => (e.currentTarget.style.visibility = 'hidden')}
                  />
                  <ModelSelectorName>{model.name}</ModelSelectorName>
                  <span className="ml-auto flex items-center gap-2">
                    <span className="text-muted-foreground text-xs tabular-nums">
                      {pricePerMillion(model)}
                    </span>
                    <Badge variant="secondary" className="hidden tabular-nums sm:inline-flex">
                      {formatCost(Number(model.promptPrice))}
                      <span className="text-[10px]">/tok</span>
                    </Badge>
                    {model.id === value ? <Check className="size-4" /> : null}
                  </span>
                </ModelSelectorItem>
              ))}
            </ModelSelectorGroup>
          ))}
        </ModelSelectorList>
      </ModelSelectorContent>
    </ModelSelector>
  );
}
