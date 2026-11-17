import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'no-store, private', Vary: 'Authorization', 'X-Content-Type-Options': 'nosniff', 'Cross-Origin-Resource-Policy': 'same-origin' };
type Context = { params: Promise<{ id: string }> };

async function proxy(request: NextRequest, context: Context, issue: boolean) {
  const { id } = await context.params;
  if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(id)) return NextResponse.json({ message: 'Некорректный клиент' }, { status: 400, headers });
  const authorization = request.headers.get('authorization') || '';
  if (!/^Bearer [A-Za-z0-9._~-]{1,8192}$/.test(authorization)) return NextResponse.json({ message: 'Требуется вход сотрудника' }, { status: 401, headers });
  let body: { identityChecked: boolean; expectedPhone: string } | undefined;
  if (issue) {
    if (request.headers.get('origin') !== 'https://app.sizey.ru') return NextResponse.json({ message: 'Недопустимый источник запроса' }, { status: 403, headers });
    if (!request.headers.get('content-type')?.startsWith('application/json')) return NextResponse.json({ message: 'Ожидается JSON' }, { status: 415, headers });
    if (Number(request.headers.get('content-length') || 0) > 2048) return NextResponse.json({ message: 'Запрос слишком большой' }, { status: 413, headers });
    try {
      const raw = await request.text();
      if (raw.length > 2048) return NextResponse.json({ message: 'Запрос слишком большой' }, { status: 413, headers });
      const input = JSON.parse(raw);
      if (input.identityChecked !== true || typeof input.expectedPhone !== 'string' || input.expectedPhone.length > 40) return NextResponse.json({ message: 'Подтвердите проверку клиента' }, { status: 400, headers });
      body = { identityChecked: true, expectedPhone: input.expectedPhone };
    } catch { return NextResponse.json({ message: 'Некорректный запрос' }, { status: 400, headers }); }
  }
  try {
    const upstream = await fetch(`http://sizey-hub-api:8080/hub-api/staff/clients/${id}/${issue ? 'issue' : 'access'}`, {
      method: issue ? 'POST' : 'GET', headers: { Authorization: authorization, ...(issue ? { Origin: 'https://hub.sizey.ru', 'Content-Type': 'application/json' } : {}) },
      ...(issue ? { body: JSON.stringify(body) } : {}), cache: 'no-store', signal: AbortSignal.timeout(15000), redirect: 'error',
    });
    return NextResponse.json(await upstream.json(), { status: upstream.status, headers });
  } catch { return NextResponse.json({ message: 'Сервис доступа временно недоступен. Попробуйте позже.' }, { status: 503, headers }); }
}
export const GET = (request: NextRequest, context: Context) => proxy(request, context, false);
export const POST = (request: NextRequest, context: Context) => proxy(request, context, true);
