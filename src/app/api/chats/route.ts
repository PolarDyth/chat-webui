import { NextResponse } from 'next/server';
import { getCurrentUserId } from '@/lib/auth';
import { dbNotConfigured, serverError, unauthenticated } from '@/lib/api-utils';
import { isDbConfigured } from '@/lib/db';
import { listChats } from '@/lib/db/queries';
export async function GET() {
  try {
    if (!isDbConfigured) return dbNotConfigured();
    const userId = await getCurrentUserId();
    if (!userId) return unauthenticated();
    const rows = await listChats(userId);
    return NextResponse.json(rows);
  } catch (error) {
    return serverError(error);
  }
}
