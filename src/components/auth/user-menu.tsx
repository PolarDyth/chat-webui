'use client';

import Link from 'next/link';
import { LogOut, Settings } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { useUser } from '@/hooks/use-user';
import { getSupabaseBrowserClient } from '@/lib/supabase/browser';

/** Sidebar footer identity block: avatar, name/email, settings, sign out. */
export function UserMenu() {
  const { user, loading } = useUser();

  if (loading) return <Skeleton className="mx-2 h-8 rounded-md" />;
  if (!user) return null;

  const email = user.email ?? '';
  const name = (user.user_metadata.full_name ?? user.user_metadata.name ?? email) as string;
  const avatarUrl = (user.user_metadata.avatar_url ?? user.user_metadata.picture) as
    | string
    | undefined;
  const initials =
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join('') || email.slice(0, 2).toUpperCase();

  const signOut = async () => {
    await getSupabaseBrowserClient()?.auth.signOut();
    // Full navigation: clears every client cache keyed to the old session.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.assign('/login');
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="hover:bg-accent flex w-full items-center gap-2 rounded-md p-1.5 text-left"
        >
          <Avatar className="size-7">
            {avatarUrl ? <AvatarImage src={avatarUrl} alt="" /> : null}
            <AvatarFallback className="text-xs">{initials}</AvatarFallback>
          </Avatar>
          <span className="truncate text-sm">{name}</span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="start" className="w-56">
        <DropdownMenuLabel className="flex flex-col">
          <span className="truncate">{name}</span>
          <span className="text-muted-foreground truncate text-xs font-normal">{email}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/settings">
            <Settings /> Settings
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem variant="destructive" onSelect={() => void signOut()}>
          <LogOut /> Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
