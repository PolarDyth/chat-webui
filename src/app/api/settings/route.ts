import { NextResponse, type NextRequest } from 'next/server';
import { getCurrentUserId } from '@/lib/auth';
import { dbNotConfigured, serverError } from '@/lib/api-utils';
import { isDbConfigured } from '@/lib/db';
import { getSettings, upsertSettings } from '@/lib/db/queries';
export async function GET() {
  try {
    if (!isDbConfigured) return dbNotConfigured();
    const userId = await getCurrentUserId();
    const row = await getSettings(userId);
    return NextResponse.json({
      apiKey: row?.apiKey ?? '',
      defaultModel: row?.defaultModel ?? '',
      systemPrompt: row?.systemPrompt ?? '',
    });
  } catch (error) {
    return serverError(error);
  }
}
export async function PUT(request: NextRequest) {
  try {
    if (!isDbConfigured) return dbNotConfigured();
    const userId = await getCurrentUserId();
    const body = (await request.json()) as {
      apiKey?: string;
      defaultModel?: string;
      systemPrompt?: string;
    };
    await upsertSettings(userId, {
      apiKey: body.apiKey?.trim() || null,
      defaultModel: body.defaultModel?.trim() || null,
      systemPrompt: body.systemPrompt ?? null,
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return serverError(error);
  }
}
