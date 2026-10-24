'use client';

import { useCallback, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, KeyRound, Loader2, Save } from 'lucide-react';
import { toast } from 'sonner';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { apiFetch } from '@/lib/client/api';
import { ModelPicker } from '@/components/chat/model-picker';
import { useModels } from '@/hooks/use-models';
import { useUser } from '@/hooks/use-user';
import { getSupabaseBrowserClient } from '@/lib/supabase/browser';
import { useSettings } from '@/hooks/use-settings';
import { formatCost } from '@/lib/format';
import type { UserSettings } from '@/lib/types';

type KeyInfo = {
  label: string | null;
  usage: unknown;
  limit: unknown;
  isFreeTier: boolean;
};

export default function SettingsPage() {
  const { settings, setSettings, dbNotConfigured, loaded, save } = useSettings();
  const { models, loading: modelsLoading } = useModels();
  const { user, loading: userLoading } = useUser();
  const [newKey, setNewKey] = useState('');
  const [savingKey, setSavingKey] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [keyInfo, setKeyInfo] = useState<KeyInfo | null>(null);
  const [accountPassword, setAccountPassword] = useState('');
  const [savingPassword, setSavingPassword] = useState(false);
  // The system prompt saves on blur; this marks it changed since the last save.
  const systemPromptDirty = useRef(false);

  /**
   * Everything except the API key auto-saves: discrete controls (picks,
   * toggles) save immediately, text saves on blur. The key stays explicit —
   * a half-typed secret must never be persisted by an accidental blur.
   */
  const saveNow = useCallback(
    async (next: UserSettings) => {
      // Before the initial GET resolves, `next` still holds defaults — saving
      // it would clobber the stored row.
      if (dbNotConfigured || !loaded) return;
      try {
        await save(next);
        toast.success('Settings saved');
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Failed to save');
      }
    },
    [save, dbNotConfigured, loaded],
  );

  const update = useCallback(
    (patch: Partial<UserSettings>) => {
      const next = { ...settings, ...patch };
      setSettings(next);
      void saveNow(next);
    },
    [settings, setSettings, saveNow],
  );

  // A password identity exists once the account has one — OAuth-only users
  // don't, and setting one gives them the backup sign-in method.
  const hasPassword = user?.identities?.some((identity) => identity.provider === 'email') ?? false;

  const savePassword = async () => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase || !accountPassword) return;
    setSavingPassword(true);
    const { error } = await supabase.auth.updateUser({ password: accountPassword });
    setSavingPassword(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setAccountPassword('');
    toast.success(hasPassword ? 'Password updated' : 'Password set — you can now sign in with email');
  };

  const saveKey = async () => {
    if (!newKey.trim()) return;
    setSavingKey(true);
    try {
      await save(settings, newKey.trim());
      setNewKey('');
      toast.success('API key saved');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to save');
    } finally {
      setSavingKey(false);
    }
  };

  const verifyKey = async () => {
    setVerifying(true);
    setKeyInfo(null);
    try {
      // With nothing typed in, validate the stored key server-side — the
      // secret itself never needs to reach the browser.
      const headers = newKey.trim() ? { 'x-openrouter-key': newKey.trim() } : undefined;
      const res = await apiFetch('/api/key', { headers });
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
          <CardTitle>Account</CardTitle>
          <CardDescription>
            {userLoading
              ? 'Checking session…'
              : user
                ? `Signed in as ${user.email}`
                : 'Not signed in.'}
          </CardDescription>
        </CardHeader>
        {user ? (
          <CardContent className="space-y-4">
            {user.identities && user.identities.length > 0 ? (
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="text-muted-foreground">Sign-in providers:</span>
                {user.identities.map((identity) => (
                  <Badge key={identity.provider} variant="secondary" className="capitalize">
                    {identity.provider}
                  </Badge>
                ))}
              </div>
            ) : null}
            <div className="space-y-2">
              <Label htmlFor="account-password">
                {hasPassword ? 'Change password' : 'Set a password'}
              </Label>
              <p className="text-muted-foreground text-xs">
                {hasPassword
                  ? 'Works alongside your connected sign-in providers.'
                  : 'Optional backup sign-in method — right now you sign in with an external provider.'}
              </p>
              <div className="flex gap-2">
                <Input
                  id="account-password"
                  type="password"
                  autoComplete="new-password"
                  minLength={6}
                  placeholder="New password"
                  value={accountPassword}
                  onChange={(e) => setAccountPassword(e.target.value)}
                  className="max-w-60"
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={savePassword}
                  disabled={savingPassword || accountPassword.length < 6}
                >
                  {savingPassword ? <Loader2 className="size-4 animate-spin" /> : null}
                  {hasPassword ? 'Update password' : 'Set password'}
                </Button>
              </div>
            </div>
          </CardContent>
        ) : null}
      </Card>

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
              <Button type="button" onClick={saveKey} disabled={savingKey || !newKey.trim()}>
                {savingKey ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
                Save key
              </Button>
            </div>
            <p className="text-muted-foreground text-xs">
              The key is the one setting that saves only when you click Save key (write-only: the
              stored key is never shown or sent back to the browser). Everything else on this page
              saves automatically.
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
              onSelect={(id) => update({ defaultModel: id })}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="system-prompt">System prompt</Label>
            <Textarea
              id="system-prompt"
              rows={6}
              placeholder="You are a concise learning partner…"
              value={settings.systemPrompt}
              onChange={(e) => {
                systemPromptDirty.current = true;
                setSettings({ ...settings, systemPrompt: e.target.value });
              }}
              onBlur={() => {
                if (!systemPromptDirty.current) return;
                systemPromptDirty.current = false;
                void saveNow(settings);
              }}
            />
            <p className="text-muted-foreground text-xs">Saves automatically when you click away.</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Smart Auto</CardTitle>
          <CardDescription>
            In Auto mode, a fast classifier reads your message and picks the answering model. The
            choice (and its confidence) is recorded on each answer.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-2">
            <Label>Router model</Label>
            <p className="text-muted-foreground text-xs">
              The classifier that picks the answering model. Pick a fast, cheap one — it runs on
              every Auto message. Default: nvidia/nemotron-3.5-lightning:free.
            </p>
            <div className="flex items-center gap-2">
              <ModelPicker
                models={models}
                loading={modelsLoading}
                value={settings.routerModel || null}
                onSelect={(id) => update({ routerModel: id })}
              />
              {settings.routerModel ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => update({ routerModel: '' })}
                >
                  Reset to default
                </Button>
              ) : null}
            </div>
          </div>

          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              <Label htmlFor="router-free-only">Only route to free models</Label>
              <p className="text-muted-foreground text-xs">
                The router picks among zero-cost models only, and paid fallbacks are skipped —
                Auto never spends credits.
              </p>
            </div>
            <Switch
              id="router-free-only"
              checked={settings.routerFreeOnly}
              onCheckedChange={(checked) => update({ routerFreeOnly: checked })}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
