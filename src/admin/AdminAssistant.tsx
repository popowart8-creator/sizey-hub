import {useEffect, useRef, useState, type FormEvent} from 'react';
import {ArrowUpRight, Send, Sparkles, X} from 'lucide-react';
import type {AdminRequest} from './editor-types';
import './admin-assistant.css';

type Answer = {answer: string; section: string | null; source?: 'model' | 'learned'};
type Turn = {role: 'user' | 'assistant'; content: string; section?: string | null; source?: Answer['source']};

type AssistantEvent = {type: 'progress'; text: string} | {type: 'answer'; answer: Answer} | {type: 'error'; message: string};

async function askAssistant(body: {section: string; history: Turn[]}, signal: AbortSignal, onProgress: (text: string) => void): Promise<Answer> {
 const response = await fetch('/hub-api/admin/ai/assistant', {
  method: 'POST', credentials: 'same-origin', cache: 'no-store', signal,
  headers: {'Content-Type': 'application/json', Accept: 'application/x-ndjson, application/json'},
  body: JSON.stringify(body)
 });
 if (!response.ok || !response.headers.get('content-type')?.includes('application/x-ndjson')) {
  const data = await response.json().catch(() => null);
  if (!response.ok || !data) {
   throw Object.assign(new Error(data?.message || 'Сервис временно недоступен'), {status: response.status});
  }
  if (typeof data.answer === 'string') return data;
  throw new Error('Сервис вернул некорректный ответ');
 }
 const reader = response.body?.getReader();
 if (!reader) throw new Error('Модель вернула пустой ответ');
 const decoder = new TextDecoder();
 let buffer = '';
 try {
  while (true) {
   const {value, done} = await reader.read();
   if (done) break;
   buffer += decoder.decode(value, {stream: true});
   const lines = buffer.split('\n');
   buffer = lines.pop() ?? '';
   for (const line of lines) {
    if (!line.trim()) continue;
    const event: AssistantEvent = JSON.parse(line);
    if (event.type === 'answer') return event.answer;
    if (event.type === 'error') throw new Error(event.message);
    if (event.type === 'progress') onProgress(event.text);
   }
  }
  throw new Error('Ответ прервался. Повторите запрос.');
 } finally {
  await reader.cancel().catch(() => {});
  reader.releaseLock();
 }
}

export default function AdminAssistant({page, sections, request, navigate, onSessionError}: {
 page: string;
 sections: readonly {id: string; label: string}[];
 request: AdminRequest;
 navigate: (page: string) => void;
 onSessionError: (error: unknown) => void;
}) {
 const [open, setOpen] = useState(false);
 const [turns, setTurns] = useState<Turn[]>([]);
 const [draft, setDraft] = useState('');
 const [busy, setBusy] = useState(false);
 const [progress, setProgress] = useState('');
 const [error, setError] = useState('');
 const [correction, setCorrection] = useState<{index: number; answer: string} | null>(null);
 const active = useRef<AbortController | null>(null);
 const trigger = useRef<HTMLButtonElement>(null);
 const panel = useRef<HTMLDialogElement>(null);
 const transcript = useRef<HTMLDivElement>(null);

 useEffect(() => () => active.current?.abort(), []);
 useEffect(() => {
  const dialog = panel.current;
  if (!dialog) return;
  void request('/ai/assistant/warm', {}).catch(() => {});
  const mobile = window.matchMedia('(max-width: 760px)');
  function showPanel() {
   if (!dialog) return;
   if (dialog.open) dialog.close();
   if (mobile.matches) dialog.showModal();
   else {
    dialog.show();
    dialog.querySelector('textarea')?.focus();
   }
  }
  showPanel();
  mobile.addEventListener('change', showPanel);
  return () => {
   mobile.removeEventListener('change', showPanel);
   if (dialog.open) dialog.close();
  };
 }, [open, request]);
 useEffect(() => {
  const list = transcript.current;
  if (list) list.scrollTop = list.scrollHeight;
 }, [turns, open, busy, error, progress]);

 function close() {
  panel.current?.close();
  setOpen(false);
  trigger.current?.focus();
 }

 async function send(event: FormEvent) {
  event.preventDefault();
  const question = draft.trim();
  if (!question || active.current || correction) return;
  const controller = new AbortController();
  active.current = controller;
  const pending: Turn[] = [...turns, {role: 'user', content: question}];
  setTurns(pending);
  setDraft('');
  setError('');
  setBusy(true);
  try {
   const history = pending.slice(-7).map(({role, content}) => ({role, content}));
   const result = await askAssistant({section: page, history}, controller.signal, setProgress);
   setTurns([...pending, {role: 'assistant', content: result.answer, section: result.section, source: result.source}]);
  } catch (error) {
   if (controller.signal.aborted) return;
   setTurns(turns);
   setDraft(question);
   if ((error as {status?: number}).status === 401) onSessionError(error);
   else setError((error as Error).message);
  } finally {
   active.current = null;
   if (!controller.signal.aborted) {
    setProgress('');
    setBusy(false);
   }
  }
 }

 async function teach(event: FormEvent) {
  event.preventDefault();
  if (!correction?.answer.trim() || active.current) return;
  const {index, answer} = correction;
  const controller = new AbortController();
  active.current = controller;
  setBusy(true);
  setError('');
  try {
   const result = await request<Answer>('/ai/assistant/learn', {
    question: turns[index - 1].content, answer, section: turns[index].section
   }, controller.signal);
   setTurns(current => current.map((turn, i) => i === index ?
    {...turn, content: result.answer, section: result.section, source: result.source} : turn));
   setCorrection(null);
  } catch (error) {
   if (controller.signal.aborted) return;
   if ((error as {status?: number}).status === 401) onSessionError(error);
   else setError((error as Error).message);
  } finally {
   active.current = null;
   if (!controller.signal.aborted) setBusy(false);
  }
 }

 return <div className="admin-assistant">
  {open && <dialog ref={panel} id="admin-assistant-panel" aria-labelledby="admin-assistant-title"
   onCancel={event => { event.preventDefault(); close(); }}
   onKeyDown={event => {
    if (event.key === 'Escape') {
     event.preventDefault();
     event.stopPropagation();
     close();
    }
   }}>
   <header>
    <h2 id="admin-assistant-title"><Sparkles size={19} /> ИИ-помощник</h2>
    <button type="button" className="icon-button" onClick={close} aria-label="Закрыть помощника" autoFocus><X size={18} /></button>
   </header>
   <div className="assistant-transcript" ref={transcript} role="log" aria-label="Переписка">
    {!turns.length && <p className="assistant-empty">Спросите о каталоге, аналитике или работе в админке.</p>}
    {turns.map((turn, index) => {
     const section = sections.find(item => item.id === turn.section && item.id !== page);
     return <div key={index} className={'assistant-message assistant-' + turn.role}>
      <span>{turn.role === 'user' ? 'Вы' : turn.source === 'learned' ? 'Сохранённый ответ' : 'Помощник'}</span>
      {correction?.index === index ? <form className="assistant-correction" onSubmit={teach}>
       <textarea autoFocus aria-label="Исправленный ответ" rows={4} maxLength={4000}
        value={correction.answer} readOnly={busy}
        onChange={event => setCorrection({...correction, answer: event.target.value})} />
       <div>
        <button className="primary" type="submit" disabled={busy || !correction.answer.trim()}>Запомнить</button>
        <button className="secondary" type="button" disabled={busy} onClick={() => setCorrection(null)}>Отмена</button>
       </div>
      </form> : <p>{turn.content}</p>}
      {turn.source && !correction && <button type="button" className="secondary" disabled={busy}
       onClick={() => setCorrection({index, answer: turn.content})}>Исправить ответ</button>}
      {section && !correction && <button type="button" className="secondary" onClick={() => {
       if (panel.current?.matches(':modal')) close();
       navigate(section.id);
      }}>
       {section.label} <ArrowUpRight size={15} />
      </button>}
     </div>;
    })}
    {busy && !correction && (progress ?
     <div className="assistant-message" aria-live="off"><span>Помощник</span><p>{progress}</p></div> :
     <p className="assistant-empty">Готовлю ответ…</p>)}
   </div>
   {error && <p className="assistant-error" role="alert">{error}</p>}
   <form onSubmit={send}>
    <textarea rows={2} enterKeyHint="send" aria-label="Сообщение помощнику" placeholder="Напишите вопрос"
     maxLength={2000} value={draft} readOnly={busy || !!correction} onChange={event => setDraft(event.target.value)}
     onKeyDown={event => {
      if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) return;
      event.preventDefault();
      event.currentTarget.form?.requestSubmit();
     }} />
    <button className="primary" type="submit" aria-label="Отправить" disabled={busy || !!correction || !draft.trim()}><Send size={18} /></button>
   </form>
  </dialog>}
  <button ref={trigger} className="assistant-trigger secondary" type="button" aria-expanded={open}
   aria-controls={open ? 'admin-assistant-panel' : undefined} onClick={() => open ? close() : setOpen(true)}>
   <Sparkles size={19} /> ИИ-помощник
  </button>
 </div>;
}
