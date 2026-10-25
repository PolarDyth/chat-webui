'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Loader2, Mail } from 'lucide-react';
import { toast } from 'sonner';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { getSupabaseBrowserClient } from '@/lib/supabase/browser';

function GithubIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-4 fill-current" aria-hidden>
      <path d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.91.58.1.79-.25.79-.55v-2.17c-3.2.7-3.87-1.36-3.87-1.36-.52-1.33-1.28-1.68-1.28-1.68-1.05-.72.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.77 2.7 1.26 3.36.96.1-.75.4-1.26.73-1.55-2.55-.29-5.23-1.28-5.23-5.68 0-1.26.45-2.28 1.19-3.09-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.18 1.18a11 11 0 0 1 5.8 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.11 3.05.74.81 1.19 1.83 1.19 3.09 0 4.41-2.69 5.38-5.25 5.67.41.35.78 1.05.78 2.12v3.14c0 .3.2.66.8.55A11.51 11.51 0 0 0 23.5 12C23.5 5.65 18.35.5 12 .5Z" />
    </svg>
  );
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" aria-hidden>
      <path
        fill="#4285F4"
        d="M23.5 12.3c0-.9-.1-1.5-.3-2.2H12v4.1h6.5c-.1 1.1-.8 2.7-2.4 3.8l-.02.15 3.5 2.7.24.02c2.2-2.05 3.5-5.05 3.5-8.58Z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.2 0 5.9-1.06 7.9-2.9l-3.76-2.9c-1 .7-2.36 1.2-4.1 1.2a7.1 7.1 0 0 1-6.7-4.9l-.14.01-3.1 2.4-.04.14A12 12 0 0 0 12 24Z"
      />
      <path
        fill="#FBBC05"
        d="M5.3 14.5a7.4 7.4 0 0 1 0-4.9l-.01-.16-3.13-2.43-.1.05a12 12 0 0 0 0 10.9l3.24-2.5Z"
      />
      <path
        fill="#EA4335"
        d="M12 4.6c2.5 0 4.2 1.1 5.2 2l3.1-3C18.4 1.8 15.5.6 12 .6A12 12 0 0 0 1.16 7.56l3.23 2.5A7.2 7.2 0 0 1 12 4.6Z"
      />
    </svg>
  );
}

/**
 * OAuth-first sign-in (the recommended flow) with email + password as the
 * backup method. Mounted under a Suspense boundary (useSearchParams).
 */
export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get('next') ?? '/app';

  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState<'oauth' | 'password' | 'reset' | null>(null);
  const [awaitingConfirmation, setAwaitingConfirmation] = useState(false);
  const [configured] = useState(() => Boolean(getSupabaseBrowserClient()));

  useEffect(() => {
    if (params.get('error') === 'auth') {
      toast.error('That sign-in link is invalid or expired. Please try again.');
    }
  }, [params]);

  const oAuthSignIn = async (provider: 'github' | 'google') => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    setBusy('oauth');
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
      },
    });
    if (error) {
      setBusy(null);
      toast.error(error.message);
    }
    // On success the browser leaves for the provider; no state to reset.
  };

  const passwordSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    setBusy('password');
    try {
      if (mode === 'signin') {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) {
          toast.error(error.message);
          return;
        }
        router.replace(next.startsWith('/') && !next.startsWith('//') ? next : '/app');
        router.refresh();
      } else {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
          },
        });
        if (error) {
          toast.error(error.message);
          return;
        }
        if (data.session) {
          router.replace(next.startsWith('/') && !next.startsWith('//') ? next : '/app');
          router.refresh();
        } else {
          setAwaitingConfirmation(true);
        }
      }
    } finally {
      setBusy(null);
    }
  };

  const forgotPassword = async () => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    if (!email.trim()) {
      toast.error('Enter your email above first, then resend the reset link.');
      return;
    }
    setBusy('reset');
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/auth/callback?next=/reset-password`,
    });
    setBusy(null);
    if (error) toast.error(error.message);
    else toast.success('Reset link sent — check your inbox.');
  };

  if (!configured) {
    return (
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Unwall</CardTitle>
        </CardHeader>
        <CardContent>
          <Alert>
            <AlertDescription>
              Supabase isn&apos;t configured on this deployment — set NEXT_PUBLIC_SUPABASE_URL and
              NEXT_PUBLIC_SUPABASE_ANON_KEY to enable sign-in.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle>Welcome back</CardTitle>
        <CardDescription>
          {mode === 'signin'
            ? 'Sign in to your Unwall account.'
            : 'Create your Unwall account.'}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {awaitingConfirmation ? (
          <div className="space-y-3 text-sm">
            <p>
              Check <span className="font-medium">{email}</span> for a confirmation link, then sign
              in.
            </p>
            <Button variant="outline" className="w-full" onClick={() => setAwaitingConfirmation(false)}>
              Back to sign in
            </Button>
          </div>
        ) : (
          <>
            <div className="grid gap-2">
              <Button onClick={() => oAuthSignIn('github')} disabled={busy !== null}>
                {busy === 'oauth' ? <Loader2 className="animate-spin" /> : <GithubIcon />}
                Continue with GitHub
              </Button>
              <Button variant="outline" onClick={() => oAuthSignIn('google')} disabled={busy !== null}>
                {busy === 'oauth' ? <Loader2 className="animate-spin" /> : <GoogleIcon />}
                Continue with Google
              </Button>
            </div>

            <div className="flex items-center gap-3">
              <Separator className="flex-1" />
              <span className="text-muted-foreground text-xs">or continue with email</span>
              <Separator className="flex-1" />
            </div>

            <form onSubmit={passwordSubmit} className="grid gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                  required
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                />
              </div>
              <Button type="submit" disabled={busy !== null}>
                {busy === 'password' ? (
                  <Loader2 className="animate-spin" />
                ) : mode === 'signin' ? (
                  <Mail />
                ) : null}
                {mode === 'signin' ? 'Sign in' : 'Create account'}
              </Button>
            </form>

            <div className="flex items-center justify-between text-xs">
              {mode === 'signin' ? (
                <button
                  type="button"
                  className="text-muted-foreground hover:text-foreground underline-offset-2 hover:underline"
                  onClick={forgotPassword}
                  disabled={busy !== null}
                >
                  Forgot password?
                </button>
              ) : (
                <span />
              )}
              <button
                type="button"
                className="text-muted-foreground hover:text-foreground underline-offset-2 hover:underline"
                onClick={() => setMode(mode === 'signin' ? 'signup' : 'signin')}
                disabled={busy !== null}
              >
                {mode === 'signin' ? 'Create an account' : 'Already have an account? Sign in'}
              </button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
