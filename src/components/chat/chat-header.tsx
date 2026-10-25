'use client';

import { Download } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { ChatTitle } from '@/components/chat/chat-title';
import { ModelPicker } from '@/components/chat/model-picker';
import { formatCost } from '@/lib/format';
import { AUTO_MODEL, FREE_MODEL, type ChatMode, type OpenRouterModel } from '@/lib/types';

export function ChatHeader({
  title,
  mode,
  model,
  routedModel,
  models,
  modelsLoading,
  totalCost,
  onModeChange,
  onModelChange,
  onExport,
  canExport,
}: {
  title: string;
  mode: ChatMode;
  model: string | null;
  /** Smart Auto's pick, sticky for this chat (issue #18); null = routes fresh. */
  routedModel: string | null;
  models: OpenRouterModel[];
  modelsLoading: boolean;
  totalCost: number;
  onModeChange: (mode: ChatMode) => void;
  onModelChange: (modelId: string) => void;
  onExport: () => void;
  canExport: boolean;
}) {
  return (
    <header className="bg-background/80 supports-[backdrop-filter]:bg-background/60 sticky top-0 z-10 flex flex-wrap items-center gap-3 border-b p-3 backdrop-blur">
      {/* Show/hide the chat list — the same trigger opens the sheet on mobile
          and collapses the rail on desktop (⌘B works too). */}
      <SidebarTrigger className="shrink-0" aria-label="Toggle chat list" />
      <ChatTitle title={title} />

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
          <Badge
            variant="outline"
            className="font-mono text-xs"
            title={
              routedModel
                ? 'Pinned for this chat — switching modes re-routes'
                : mode === 'auto'
                  ? 'OpenRouter picks the best model per request'
                  : 'Route to free models only'
            }
          >
            {routedModel ?? (mode === 'auto' ? AUTO_MODEL : FREE_MODEL)}
          </Badge>
        )}

        <Badge variant="secondary" className="tabular-nums" title="Total spend in this chat">
          Σ {formatCost(totalCost)}
        </Badge>

        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onExport}
          disabled={!canExport}
          title="Export as Markdown"
          aria-label="Export chat as Markdown"
        >
          <Download />
        </Button>
      </div>
    </header>
  );
}
