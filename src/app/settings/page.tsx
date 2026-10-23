'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Eye, EyeOff, Loader2, Save } from 'lucide-react';
import { toast } from 'sonner';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ModelPicker } from '@/components/chat/model-picker';
import { useModels } from '@/hooks/use-models';
import { useSettings } from '@/hooks/use-settings';
import { formatCost } from '@/lib/format';

type KeyInfo = {
  label: string | null;
  usage: unknown;
  limit: unknown;
  isFreeTier: boolean;
};

export default function SettingsPage() {
  const { settings, setSettings, dbNotConfigured, save } = useSettings();
  const { models, loading: modelsLoading } = useModels();
  const [showKey, setShowKey] = useState(false);
  const [saving, setSaving] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [keyInfo, setKeyInfo] = useState<KeyInfo | null>(null);

  const persist = async () => {
    setSaving(true);
    try {
      await save(settings);
      toast.success('Settings saved');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const verifyKey = async () => {
    setVerifying(true);
    setKeyInfo(null);
    try {
      const res = await fetch('/api/key', {
        headers: { 'x-openrouter-key': settings.apiKey },
      });
      const body = (await res.json()) as KeyInfo & { message?: string };
      if (!res.ok) {
        toast.error(body.message ?? 'Key rejected by OpenRouter');
      } else {
        setKeyInfo(body);
        toast.success('Key works');
      }
    } catch {
      toast.error('Could not reach OpenRouter');
    } finally {
      setVerifying(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" asChild aria-label="Back to workspace">
          <Link href="/">
            <ArrowLeft />
          </Link>
        </Button>
        <h1 className="text-lg font-semibold">Settings</h1>
      </div>

      {dbNotConfigured ? (
        <Alert>
          <AlertDescription>
            Database not configured — settings cannot be saved. See the README to connect Supabase.
          </AlertDescription>
        </Alert>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>OpenRouter</CardTitle>
          <CardDescription>
            One key for every model. It is stored in your own database and sent server-side to
            OpenRouter — it never reaches the browser bundle.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="api-key">API key</Label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Input
                  id="api-key"
                  type={showKey ? 'text' : 'password'}
                  placeholder="sk-or-v1-…"
                  value={settings.apiKey}
                  onChange={(e) => setSettings({ ...settings, apiKey: e.target.value })}
                  className="pr-10 font-mono"
                  autoComplete="off"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute top-1/2 right-1 size-7 -translate-y-1/2"
                  onClick={() => setShowKey((v) => !v)}
                  aria-label={showKey ? 'Hide key' : 'Show key'}
                >
                  {showKey ? <EyeOff /> : <Eye />}
                </Button>
              </div>
              <Button type="button" variant="outline" onClick={verifyKey} disabled={verifying || !settings.apiKey}>
                {verifying ? <Loader2 className="size-4 animate-spin" /> : null}
                Verify
              </Button>
            </div>
            {keyInfo ? (
              <p className="text-muted-foreground flex flex-wrap items-center gap-2 text-xs">
                <Badge variant={keyInfo.isFreeTier ? 'secondary' : 'default'}>
                  {keyInfo.isFreeTier ? 'free tier' : 'paid'}
                </Badge>
                {keyInfo.label ? <span>{keyInfo.label}</span> : null}
                <span className="tabular-nums">
                  spent {formatCost(Number(keyInfo.usage) || 0)}
                  {keyInfo.limit !== null && keyInfo.limit !== undefined
                    ? ` of ${formatCost(Number(keyInfo.limit))}`
                    : ' (no hard limit)'}
                </span>
              </p>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label>Default model</Label>
            <p className="text-muted-foreground text-xs">
              Used as the first fallback target when a request is rate-limited. Modes still start
              from openrouter/auto or openrouter/free unless you pick Manual.
            </p>
            <ModelPicker
              models={models}
              loading={modelsLoading}
              value={settings.defaultModel || null}
              onSelect={(id) => setSettings({ ...settings, defaultModel: id })}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="system-prompt">System prompt</Label>
            <Textarea
              id="system-prompt"
              rows={6}
              placeholder="You are a concise learning partner…"
              value={settings.systemPrompt}
              onChange={(e) => setSettings({ ...settings, systemPrompt: e.target.value })}
            />
          </div>

          <div className="flex justify-end">
            <Button onClick={persist} disabled={saving || dbNotConfigured}>
              {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
              Save settings
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
