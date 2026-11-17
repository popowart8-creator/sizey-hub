import { api, ApiError, getAccessToken } from '@/lib/api';

export async function customerAccessApi<T>(clientId: string, body?: unknown, retry = true): Promise<T> {
  const token = getAccessToken();
  if (!token) throw new ApiError('Войдите в бонусную систему заново.', 401);
  let response: Response;
  try {
    response = await fetch(`/api/customer-access/${encodeURIComponent(clientId)}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { Authorization: `Bearer ${token}`, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      credentials: 'same-origin', cache: 'no-store',
    });
  } catch { throw new ApiError('Нет связи с сервисом доступа. Пароль не получен — проверьте соединение.', 0); }
  if (response.status === 401 && retry) {
    await api('/api/auth/me'); // Reuse the cabinet's existing refresh-token flow.
    return customerAccessApi<T>(clientId, body, false);
  }
  let data;
  try { data = await response.json(); } catch { throw new ApiError('Сервис доступа временно недоступен.', response.status); }
  if (!response.ok) throw new ApiError(typeof data.message === 'string' ? data.message : 'Не удалось выполнить запрос', response.status);
  return data as T;
}
