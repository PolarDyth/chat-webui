'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, KeyRound, Loader2, Save } from 'lucide-react';
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
  const [newKey, setNewKey] = useState('');
  const [saving, setSaving] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [keyInfo, setKeyInfo] = useState<KeyInfo | null>(null);

  const persist = async () => {
    setSaving(true);
    try {
      await save(settings, newKey.trim() || undefined);
      setNewKey('');
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
      // With nothing typed in, validate the stored key server-side — the
      // secret itself never needs to reach the browser.
      const headers = newKey.trim() ? { 'x-openrouter-key': newKey.trim() } : undefined;
      const res = await fetch('/api/key', { headers });
      const body = (await res.json()) as KeyInfo & { message?: string };
      if (!res.ok) {
        toast.error(body.message ?? 'Key rejected by OpenRouter');
      } else {
        setKeyInfo(body);
        toast.success(newKey.trim() ? 'New key works — save to store it' : 'Key works');
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
            One key for every model. It is stored encrypted in your own database and used only
            server-side — it is never sent to the browser.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="api-key">API key</Label>
            <div className="flex items-center gap-2 text-sm">
              {settings.apiKeySet ? (
                <Badge variant="secondary" className="gap-1 font-mono">
                  <KeyRound className="size-3" />
                  stored {settings.keyHint ?? ''}
                </Badge>
              ) : (
                <span className="text-muted-foreground text-xs">No key stored yet.</span>
              )}
            </div>
            <div className="flex gap-2">
              <Input
                id="api-key"
                type="password"
                placeholder={settings.apiKeySet ? 'Enter a new key to replace it' : 'sk-or-v1-…'}
                value={newKey}
                onChange={(e) => setNewKey(e.target.value)}
                className="font-mono"
                autoComplete="off"
              />
              <Button
                type="button"
                variant="outline"
                onClick={verifyKey}
                disabled={verifying || (!newKey.trim() && !settings.apiKeySet)}
              >
                {verifying ? <Loader2 className="size-4 animate-spin" /> : null}
                Verify
              </Button>
            </div>
            <p className="text-muted-foreground text-xs">
              Leave empty to keep the stored key. The field is write-only: the stored key is never
              shown or sent back to the browser.
            </p>
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
