import { NextResponse, type NextRequest } from 'next/server';
import { getCurrentUserId } from '@/lib/auth';
import { badRequest, dbNotConfigured, serverError, unauthorized } from '@/lib/api-utils';
import { isDbConfigured } from '@/lib/db';
import { deleteChat, getChat, getMessages, updateChat } from '@/lib/db/queries';
import type { ChatMessageMetadata, ChatMode, MessageVariant } from '@/lib/types';
type RouteParams = { params: Promise<{ id: string }> };
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export async function GET(_request: NextRequest, { params }: RouteParams) {
  try {
    if (!isDbConfigured) return dbNotConfigured();
    const { id } = await params;
    if (!UUID_RE.test(id)) return badRequest('Invalid chat id');
    const userId = await getCurrentUserId();
    const chat = await getChat(userId, id);
    if (!chat) return unauthorized();
    const rows = await getMessages(userId, id);
    return NextResponse.json({
      chat,
      messages: rows.map((row) => ({
        id: row.id,
        role: row.role,
        parts: row.parts,
        metadata: {
          ...((row.metadata as ChatMessageMetadata) ?? {}),
          createdAt: row.createdAt.toISOString(),
          variants: (row.variants as MessageVariant[] | null) ?? undefined,
        },
      })),
    });
  } catch (error) {
    return serverError(error);
  }
}
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    if (!isDbConfigured) return dbNotConfigured();
    const { id } = await params;
    if (!UUID_RE.test(id)) return badRequest('Invalid chat id');
    const userId = await getCurrentUserId();
    const chat = await getChat(userId, id);
    if (!chat) return unauthorized();
    const body = (await request.json()) as {
      title?: string;
      pinned?: boolean;
      mode?: ChatMode;
      model?: string | null;
    };
    await updateChat(userId, id, {
      ...(body.title !== undefined ? { title: body.title.trim() || 'New chat' } : {}),
      ...(body.pinned !== undefined ? { pinned: body.pinned } : {}),
      ...(body.mode !== undefined ? { mode: body.mode } : {}),
      ...(body.model !== undefined ? { model: body.model || null } : {}),
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return serverError(error);
  }
}
export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  try {
    if (!isDbConfigured) return dbNotConfigured();
    const { id } = await params;
    if (!UUID_RE.test(id)) return badRequest('Invalid chat id');
    const userId = await getCurrentUserId();
    await deleteChat(userId, id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return serverError(error);
  }
}
