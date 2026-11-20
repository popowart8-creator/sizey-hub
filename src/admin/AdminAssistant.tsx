import {useEffect, useRef, useState, type FormEvent} from 'react';
import {ArrowUpRight, Send, Sparkles, X} from 'lucide-react';
import type {AdminRequest} from './editor-types';
import './admin-assistant.css';

type Turn = {role: 'user' | 'assistant'; content: string; section?: string | null};
type Answer = {answer: string; section: string | null};

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
 const [error, setError] = useState('');
 const active = useRef<AbortController | null>(null);
 const trigger = useRef<HTMLButtonElement>(null);
 const panel = useRef<HTMLDialogElement>(null);
 const transcript = useRef<HTMLDivElement>(null);

 useEffect(() => () => active.current?.abort(), []);
 useEffect(() => {
  const dialog = panel.current;
  if (!dialog) return;
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
 }, [open]);
 useEffect(() => {
  const list = transcript.current;
  if (list) list.scrollTop = list.scrollHeight;
 }, [turns, open, busy, error]);

 function close() {
  panel.current?.close();
  setOpen(false);
  trigger.current?.focus();
 }

 async function send(event: FormEvent) {
  event.preventDefault();
  const question = draft.trim();
  if (!question || active.current) return;
  const controller = new AbortController();
  active.current = controller;
  const pending: Turn[] = [...turns, {role: 'user', content: question}];
  setTurns(pending);
  setDraft('');
  setError('');
  setBusy(true);
  try {
   const history = pending.slice(-7).map(({role, content}) => ({role, content}));
   const result = await request<Answer>('/ai/assistant', {section: page, history}, controller.signal);
   setTurns([...pending, {role: 'assistant', content: result.answer, section: result.section}]);
  } catch (error) {
   if (controller.signal.aborted) return;
   setTurns(turns);
   setDraft(question);
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
      <span>{turn.role === 'user' ? 'Вы' : 'Помощник'}</span>
      <p>{turn.content}</p>
      {section && <button type="button" className="secondary" onClick={() => {
       if (panel.current?.matches(':modal')) close();
       navigate(section.id);
      }}>
       {section.label} <ArrowUpRight size={15} />
      </button>}
     </div>;
    })}
    {busy && <p className="assistant-empty">Готовлю ответ…</p>}
   </div>
   {error && <p className="assistant-error" role="alert">{error}</p>}
   <form onSubmit={send}>
    <textarea rows={2} enterKeyHint="send" aria-label="Сообщение помощнику" placeholder="Напишите вопрос"
     maxLength={2000} value={draft} readOnly={busy} onChange={event => setDraft(event.target.value)}
     onKeyDown={event => {
      if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) return;
      event.preventDefault();
      event.currentTarget.form?.requestSubmit();
     }} />
    <button className="primary" type="submit" aria-label="Отправить" disabled={busy || !draft.trim()}><Send size={18} /></button>
   </form>
  </dialog>}
  <button ref={trigger} className="assistant-trigger secondary" type="button" aria-expanded={open}
   aria-controls={open ? 'admin-assistant-panel' : undefined} onClick={() => open ? close() : setOpen(true)}>
   <Sparkles size={19} /> ИИ-помощник
  </button>
 </div>;
}
