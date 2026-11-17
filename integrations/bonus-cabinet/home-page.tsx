'use client';

import { FormEvent, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { RequireAuth } from '@/components/require-auth';
import { api, money } from '@/lib/api';
import type { Client } from '@/lib/types';
import { StickyActions } from '@/components/sticky-actions';

function HomeContent() {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Client[] | null>(null);
  const [recent, setRecent] = useState<Client[]>([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState('');

  const [loadingClients, setLoadingClients] = useState(true);
  const [clientsError, setClientsError] = useState('');

  async function loadClients() {
    setLoadingClients(true);
    setClientsError('');
    try {
      setRecent(await api<Client[]>('/api/clients?all=true'));
    } catch (err) {
      setClientsError(err instanceof Error ? err.message : 'Не удалось загрузить клиентов');
    } finally {
      setLoadingClients(false);
    }
  }

  useEffect(() => { void loadClients(); }, []);

  async function onSearch(e: FormEvent) {
    e.preventDefault();
    if (!query.trim()) return;
    setSearching(true);
    setError('');
    try {
      const items = await api<Client[]>(
        `/api/clients/search?q=${encodeURIComponent(query.trim())}`,
      );
      setResults(items);
      if (items.length === 1) {
        router.push(`/clients/${items[0].id}`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка поиска');
    } finally {
      setSearching(false);
    }
  }

  return (
    <div className="space-y-6 md:space-y-8">
      <section className="panel overflow-hidden p-4 md:p-8">
        <div className="mb-5 max-w-2xl md:mb-6">
          <h1 className="page-title max-md:sr-only">Поиск клиента</h1>
          <p className="page-subtitle max-md:mt-0">
            Найдите гостя по телефону или имени и проведите продажу с
            начислением бонусов.
          </p>
        </div>
        <form onSubmit={onSearch} className="flex flex-col gap-3 md:flex-row">
          <input
            className="field flex-1"
            placeholder="Телефон или имя"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            inputMode="search"
            autoComplete="off"
            autoCorrect="off"
            enterKeyHint="search"
            aria-label="Телефон или имя"
          />
          <button className="btn-primary md:min-w-[120px]" disabled={searching}>
            {searching ? 'Ищем…' : 'Найти'}
          </button>
          <Link href="/clients/new" className="btn-secondary hidden text-center md:inline-flex">
            Создать клиента
          </Link>
        </form>
        {error && (
          <div className="mt-4 rounded-xl bg-coral-500/10 px-3 py-3 text-sm text-coral-600">
            {error}
          </div>
        )}
      </section>

      {results && (
        <section className="panel p-4 md:p-6">
          <h2 className="section-title mb-4">Результаты поиска</h2>
          {results.length === 0 ? (
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-base text-ink-500">Клиент не найден.</p>
              <Link
                href={`/clients/new?phone=${encodeURIComponent(query)}`}
                className="btn-primary"
              >
                Создать клиента
              </Link>
            </div>
          ) : (
            <div className="divide-y divide-sand-200">
              {results.map((client) => (
                <Link
                  key={client.id}
                  href={`/clients/${client.id}`}
                  className="flex min-h-12 flex-col gap-1 py-3 transition hover:bg-sand-50/80 md:flex-row md:items-center md:justify-between"
                >
                  <div className="min-w-0">
                    <div className="font-semibold break-anywhere">{client.name}</div>
                    <div className="text-sm text-ink-500">{client.phone}</div>
                  </div>
                  <div className="text-sm md:text-right">
                    <div className="font-semibold text-moss-700">
                      {client.loyaltyLevel?.name}
                    </div>
                    <div>{client.bonusBalance} бонусов</div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>
      )}

      <section className="panel p-4 md:p-6">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="section-title">Все клиенты{!loadingClients && !clientsError && ` · ${recent.length}`}</h2>
          <Link
            href="/clients/new"
            className="touch-target hidden shrink-0 items-center justify-end px-2 text-sm font-semibold text-coral-600 md:inline-flex"
          >
            + Новый
          </Link>
        </div>
        {loadingClients ? (
          <p className="text-base text-ink-500" role="status">Загружаем клиентов…</p>
        ) : clientsError ? (
          <div role="alert" className="space-y-3">
            <p className="text-base text-coral-600">{clientsError}</p>
            <button className="btn-secondary" onClick={() => void loadClients()}>Повторить</button>
          </div>
        ) : recent.length === 0 ? (
          <p className="text-base text-ink-500">Пока нет клиентов.</p>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {recent.map((client) => (
              <Link
                key={client.id}
                href={`/clients/${client.id}`}
                className="min-w-0 rounded-2xl border border-sand-200 bg-white/80 p-4 transition hover:-translate-y-0.5 hover:shadow-soft"
              >
                <div className="font-semibold break-anywhere">{client.name}</div>
                <div className="mt-1 text-sm text-ink-500">{client.phone}</div>
                <div className="mt-3 flex items-center justify-between gap-3 text-sm">
                  <span className="min-w-0 truncate rounded-full bg-moss-100 px-2 py-1 font-semibold text-moss-700">
                    {client.loyaltyLevel?.name}
                  </span>
                  <span className="min-w-0 text-right break-anywhere">
                    {client.bonusBalance} · {money(client.totalPurchases)}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>

      <div className="md:hidden">
        <StickyActions>
          <Link href="/clients/new" className="btn-secondary w-full text-center">
            Создать клиента
          </Link>
        </StickyActions>
      </div>
    </div>
  );
}

export default function HomePage() {
  return (
    <RequireAuth>
      <HomeContent />
    </RequireAuth>
  );
}
