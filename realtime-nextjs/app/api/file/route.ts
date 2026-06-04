import { readDemoFile, writeDemoFile } from '@/lib/session';

export async function GET() {
  const content = await readDemoFile();
  return Response.json({ content });
}

export async function PUT(request: Request) {
  const body = (await request.json()) as { content?: unknown };
  if (typeof body.content !== 'string') {
    return Response.json({ error: 'content must be a string' }, { status: 400 });
  }
  await writeDemoFile(body.content);
  return Response.json({ ok: true });
}
