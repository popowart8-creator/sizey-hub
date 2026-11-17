'use client';

import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { customerAccessApi } from '@/lib/customer-access-api';

type Access = { exists: boolean; phone: string; temporaryPasswordPending: boolean; mustChangePassword: boolean; issued: boolean };
type Issued = { phone: string; temporaryPassword: string; mustChangePassword: boolean };

export function CustomerAccess({ clientId, clientName, phone, phoneNormalized }: { clientId: string; clientName: string; phone: string; phoneNormalized: string }) {
  const [access, setAccess] = useState<Access | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [checked, setChecked] = useState(false);
  const [issued, setIssued] = useState<Issued | null>(null);
  const [copied, setCopied] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const load = useCallback(async () => {
    setLoading(true);
    try { setAccess(await customerAccessApi<Access>(clientId)); setError(''); }
    catch (e) { setError(e instanceof Error ? e.message : 'Не удалось загрузить доступ'); }
    finally { setLoading(false); }
  }, [clientId]);
  useEffect(() => { setIssued(null); void load(); }, [load]);
  useEffect(() => {
    if (confirming && !dialog.current?.open) dialog.current?.showModal();
    if (!confirming && dialog.current?.open) dialog.current.close();
  }, [confirming]);
  useEffect(() => {
    if (!issued) return;
    const timer = window.setTimeout(() => { setIssued(null); setCopied(false); }, 60000);
    return () => window.clearTimeout(timer);
  }, [issued]);
  async function issue(event: FormEvent) {
    event.preventDefault(); if (!checked) return;
    setBusy(true); setError('');
    try {
      const result = await customerAccessApi<Issued>(clientId, { identityChecked: true, expectedPhone: phoneNormalized });
      setIssued(result); setCopied(false); setConfirming(false); setChecked(false);
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : 'Не удалось выдать пароль'); }
    finally { setBusy(false); }
  }
  return (
    <section className="panel p-4 md:p-6" aria-labelledby="customer-access-title">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h2 id="customer-access-title" className="section-title">Доступ в SIZEY</h2>
          <p className="mt-2 text-base text-ink-500">Вход клиента в <a className="font-semibold underline underline-offset-4" href="https://hub.sizey.ru" target="_blank" rel="noreferrer">hub.sizey.ru</a> по телефону и паролю.</p>
          <p className="mt-2 text-sm text-ink-500" role="status">{loading ? 'Проверяем доступ…' : !access ? 'Статус недоступен' : !access.exists ? 'Аккаунт ещё не создан' : access.temporaryPasswordPending ? 'Временный пароль готов к выдаче' : access.mustChangePassword ? 'Ожидается смена временного пароля' : 'Аккаунт клиента подключён'}</p>
        </div>
        <button className="btn-secondary shrink-0" disabled={loading || busy || !access} onClick={() => { setIssued(null); setChecked(false); setError(''); setConfirming(true); }}>
          {!access?.exists ? 'Создать доступ' : access.temporaryPasswordPending ? 'Выдать пароль' : 'Сбросить пароль'}
        </button>
      </div>
      {error && <div className="mt-4 rounded-xl bg-coral-500/10 px-4 py-3 text-base text-coral-600" role="alert">{error}<button className="btn-ghost mt-2 block" disabled={busy} onClick={() => void load()}>Повторить проверку</button></div>}
      {issued && <div className="mt-5 rounded-2xl border border-moss-700/20 bg-moss-100 p-4 md:p-5" role="status">
        <h3 className="text-lg font-bold">Временный пароль для {issued.phone}</h3>
        <code className="mt-3 block select-all rounded-xl bg-white p-4 font-mono text-xl font-bold break-all md:text-2xl">{issued.temporaryPassword}</code>
        <p className="mt-3 text-base text-ink-500">Передайте пароль лично клиенту. Он скроется через минуту. При первом входе клиент задаст свой пароль.</p>
        <div className="mt-4 flex flex-wrap gap-3">
          <button className="btn-primary" onClick={async () => { try { await navigator.clipboard.writeText(issued.temporaryPassword); setCopied(true); } catch { setError('Не удалось скопировать. Передайте пароль клиенту вручную.'); } }}>{copied ? 'Скопировано' : 'Скопировать пароль'}</button>
          <button className="btn-ghost" onClick={() => { setIssued(null); setCopied(false); }}>Скрыть пароль</button>
        </div>
      </div>}
      <dialog ref={dialog} className="m-auto w-[calc(100%_-_32px)] max-w-lg rounded-2xl border-0 bg-white p-5 text-ink-900 shadow-2xl backdrop:bg-black/40 md:p-7" aria-labelledby="issue-password-title" onCancel={(event) => { if (busy) event.preventDefault(); else setConfirming(false); }}>
        <h3 id="issue-password-title" className="text-xl font-bold">Выдать временный пароль</h3>
        <p className="mt-3 text-lg font-semibold break-anywhere">{clientName}</p><p className="mt-1 text-base text-ink-500">{phone}</p>
        <p className="mt-4 text-base text-ink-500">Предыдущий пароль перестанет действовать, активные сеансы клиента завершатся. При входе потребуется сменить временный пароль.</p>
        {error && <p className="mt-4 text-base text-coral-600" role="alert">{error}</p>}
        <form onSubmit={(e) => void issue(e)}>
          <label className="mt-5 flex cursor-pointer items-start gap-3 text-base"><input type="checkbox" required checked={checked} disabled={busy} onChange={(e) => setChecked(e.target.checked)} className="mt-1 h-6 w-6 shrink-0 accent-moss-700"/><span>Я проверил личность клиента и принадлежность указанного номера телефона.</span></label>
          <div className="mt-6 grid gap-3 sm:grid-cols-2"><button type="button" className="btn-ghost" disabled={busy} onClick={() => setConfirming(false)}>Отмена</button><button type="submit" className="btn-primary" disabled={busy || !checked}>{busy ? 'Подготавливаем…' : 'Выдать пароль'}</button></div>
        </form>
      </dialog>
    </section>
  );
}
