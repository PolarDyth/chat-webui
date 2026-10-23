'use client';

import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { ModelPicker } from '@/components/chat/model-picker';
import { formatCost } from '@/lib/format';
import { AUTO_MODEL, FREE_MODEL, type ChatMode, type OpenRouterModel } from '@/lib/types';

export function ChatHeader({
  title,
  mode,
  model,
  models,
  modelsLoading,
  totalCost,
  onModeChange,
  onModelChange,
}: {
  title: string;
  mode: ChatMode;
  model: string | null;
  models: OpenRouterModel[];
  modelsLoading: boolean;
  totalCost: number;
  onModeChange: (mode: ChatMode) => void;
  onModelChange: (modelId: string) => void;
}) {
  return (
    <header className="bg-background/80 supports-[backdrop-filter]:bg-background/60 sticky top-0 z-10 flex flex-wrap items-center gap-3 border-b p-3 backdrop-blur">
      <h1 className="min-w-0 flex-1 truncate text-sm font-medium">{title}</h1>

      <div className="flex items-center gap-2">
        <Tabs value={mode} onValueChange={(v) => onModeChange(v as ChatMode)}>
          <TabsList>
            <TabsTrigger value="auto" title="OpenRouter picks the best model per request">
              Auto
            </TabsTrigger>
            <TabsTrigger value="free" title="Route to free models only">
              Free
            </TabsTrigger>
            <TabsTrigger value="manual">Manual</TabsTrigger>
          </TabsList>
        </Tabs>

        {mode === 'manual' ? (
          <ModelPicker
            models={models}
            loading={modelsLoading}
            value={model}
            onSelect={onModelChange}
            placeholder="Pick a model…"
            triggerClassName="max-w-56"
          />
        ) : (
          <Badge variant="outline" className="font-mono text-xs">
            {mode === 'auto' ? AUTO_MODEL : FREE_MODEL}
          </Badge>
        )}

        <Badge variant="secondary" className="tabular-nums" title="Total spend in this chat">
          Σ {formatCost(totalCost)}
        </Badge>
      </div>
    </header>
  );
}
