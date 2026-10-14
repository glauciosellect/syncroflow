"use client";

/**
 * GCalAgenda — visual idêntico ao Google Calendar.
 * Views: mês, semana, dia, agenda (lista).
 * Integra: agendamentos locais + Google Calendar + Tarefas pessoais.
 */

import {
  useState, useEffect, useRef, useCallback, useMemo,
} from "react";
import {
  format, addMonths, subMonths, addWeeks, subWeeks, addDays, subDays,
  startOfMonth, endOfMonth, startOfWeek, endOfWeek, eachDayOfInterval,
  isSameMonth, isSameDay, isToday, getHours, getMinutes,
  startOfDay, endOfDay, parseISO, isBefore, setHours, setMinutes,
  differenceInMinutes,
} from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  ChevronLeft, ChevronRight, Plus, Calendar,
  RefreshCw, Search, Settings, Loader2, X, Clock, MapPin,
  AlignLeft, Trash2, Edit2, ExternalLink,
  CheckSquare, Square, CheckCheck, ListTodo, Palette, Timer,
} from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import api from "@/lib/api";

// Agendamentos locais do SyncroLex não existem aqui: o Google Calendar é a fonte da verdade.
// O tipo fica só para manter compatível o código portado.
type Agendamento = Record<string, any>;

// Wrapper com cara de fetch(), usando o axios autenticado do SyncroFlow.
async function agendaFetch(path: string, init?: { method?: string; headers?: any; body?: string }) {
  try {
    const res = await api.request({
      url: path.replace("/api/agenda", "/agenda"),
      method: (init?.method ?? "GET") as any,
      data: init?.body ? JSON.parse(init.body) : undefined,
      validateStatus: () => true,
    });
    return { ok: res.status >= 200 && res.status < 300, status: res.status, json: async () => res.data, text: async () => JSON.stringify(res.data) };
  } catch {
    return { ok: false, status: 0, json: async () => ({}), text: async () => "" };
  }
}

// ─── Types ─────────────────────────────────────────────────────────────────────

export type CalView = "month" | "week" | "day" | "agenda";

export interface CalEvent {
  id: string;
  title: string;
  start: Date;
  end: Date;
  allDay?: boolean;
  color: string;
  textColor: string;
  source: "local" | "google" | "tarefa" | "prazo";
  googleId?: string;
  resource?: Agendamento;
  tarefaId?: string;
  tarefaConcluida?: boolean;
  description?: string;
  location?: string;
  prazoStatus?: "pendente" | "cumprido" | "vencido";
}

export interface PrazoLocal {
  id: string;
  descricao: string;
  data_prazo: string;
  status: "pendente" | "cumprido" | "vencido";
  process_numero?: string | null;
  client_nome?: string | null;
}

export interface TarefaLocal {
  id: string;
  titulo: string;
  status: "aberta" | "em_andamento" | "concluida";
  data_hora: string | null;
  data_hora_fim: string | null;
  concluida_em: string | null;
  created_at: string;
}

// Cores
const GOOGLE_COLORS = [
  { bg: "#d50000" }, { bg: "#e67c73" }, { bg: "#f4511e" },
  { bg: "#f6bf26" }, { bg: "#33b679" }, { bg: "#0b8043" },
  { bg: "#039be5" }, { bg: "#3f51b5" }, { bg: "#7986cb" },
  { bg: "#8e24aa" }, { bg: "#616161" },
];

const STATUS_COLOR_DEFAULT: Record<string, { bg: string; text: string }> = {
  agendado:       { bg: "#1a73e8", text: "#fff" },
  confirmado:     { bg: "#0b8043", text: "#fff" },
  cancelado:      { bg: "#d93025", text: "#fff" },
  realizado:      { bg: "#188038", text: "#fff" },
  nao_compareceu: { bg: "#f4511e", text: "#fff" },
};

export type StatusColors = Partial<Record<"agendado" | "confirmado" | "realizado" | "cancelado", string>>;

// Tarefa — verde-musgo estilo Google Tasks
const TAREFA_COLOR = { bg: "#137333", text: "#fff" };
const TAREFA_CONCLUIDA_COLOR = { bg: "#5f6368", text: "#fff" };

// Prazo — cor por status (sempre em sincronia com a tabela `prazos`)
const PRAZO_STATUS_COLOR: Record<"pendente" | "cumprido" | "vencido", { bg: string; text: string }> = {
  pendente: { bg: "#f9ab00", text: "#fff" },
  vencido:  { bg: "#d93025", text: "#fff" },
  cumprido: { bg: "#188038", text: "#fff" },
};

const HORA_MIN = 7;
const HORA_MAX = 21;
const TOTAL_HORAS = HORA_MAX - HORA_MIN;
const ALTURA_HORA = 64;

// ─── Helpers ───────────────────────────────────────────────────────────────────

function eventTop(start: Date) {
  return (getHours(start) - HORA_MIN + getMinutes(start) / 60) * ALTURA_HORA;
}
function eventHeight(start: Date, end: Date) {
  return Math.max((differenceInMinutes(end, start) / 60) * ALTURA_HORA, 22);
}
// Layout de colisão estilo Google Calendar: dois eventos só dividem largura
// entre si quando realmente se sobrepõem no tempo (direta ou
// transitivamente, através de um terceiro evento que faz ponte entre os
// dois). Eventos sem nenhuma sobreposição ocupam a coluna inteira do dia.
//
// A versão anterior (groupOverlapping) tinha a lógica invertida: jogava
// eventos SEM sobreposição em colunas cada vez mais estreitas (a largura
// dependia do total de grupos do dia inteiro, não de quem realmente
// concorria por espaço), e empilhava eventos QUE de fato se sobrepunham
// exatamente um em cima do outro na mesma coluna — por isso a Agenda em
// "Dia"/"Semana" ficava ilegível, bem diferente do Google Calendar original.
function layoutDayEvents(events: CalEvent[]): { event: CalEvent; col: number; cols: number }[] {
  if (!events.length) return [];
  const sorted = [...events].sort((a, b) => a.start.getTime() - b.start.getTime());
  const n = sorted.length;

  // 1) Une em clusters os eventos que se sobrepõem (union-find) — precisa
  // ser transitivo: se A se sobrepõe com B e B com C, os três disputam
  // espaço entre si mesmo que A e C não se toquem diretamente.
  const parent = Array.from({ length: n }, (_, i) => i);
  function find(x: number): number { return parent[x] === x ? x : (parent[x] = find(parent[x])); }
  function union(a: number, b: number) { const ra = find(a), rb = find(b); if (ra !== rb) parent[ra] = rb; }
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (isBefore(sorted[i].start, sorted[j].end) && isBefore(sorted[j].start, sorted[i].end)) union(i, j);
    }
  }
  const clusters = new Map<number, number[]>();
  for (let i = 0; i < n; i++) {
    const root = find(i);
    if (!clusters.has(root)) clusters.set(root, []);
    clusters.get(root)!.push(i);
  }

  // 2) Dentro de cada cluster, atribui colunas de forma gulosa — reaproveita
  // a primeira coluna já livre no horário de início do evento, só abre
  // coluna nova quando nenhuma está livre.
  const layout = new Map<string, { col: number; cols: number }>();
  for (const idxs of Array.from(clusters.values())) {
    const columnLastEnd: Date[] = [];
    const columnOf: number[] = [];
    for (const i of idxs) {
      const ev = sorted[i];
      let col = columnLastEnd.findIndex(end => !isBefore(ev.start, end));
      if (col === -1) { col = columnLastEnd.length; columnLastEnd.push(ev.end); }
      else { columnLastEnd[col] = ev.end; }
      columnOf.push(col);
    }
    const cols = columnLastEnd.length;
    idxs.forEach((i, k) => layout.set(sorted[i].id, { col: columnOf[k], cols }));
  }

  return sorted.map(ev => ({ event: ev, ...layout.get(ev.id)! }));
}

function getViewRange(view: CalView, current: Date) {
  if (view === "month") return {
    timeMin: startOfWeek(startOfMonth(current), { weekStartsOn: 0 }),
    timeMax: endOfWeek(endOfMonth(current), { weekStartsOn: 0 }),
  };
  if (view === "week") return {
    timeMin: startOfWeek(current, { weekStartsOn: 0 }),
    timeMax: endOfWeek(current, { weekStartsOn: 0 }),
  };
  if (view === "day") return {
    timeMin: startOfDay(current),
    timeMax: endOfDay(current),
  };
  return { timeMin: current, timeMax: addMonths(current, 2) };
}

// ─── Props ─────────────────────────────────────────────────────────────────────

interface GCalAgendaProps {
  agendamentos: Agendamento[];
  googleConnected: boolean;
  onRefresh?: () => void;
  onOpenSettings?: () => void;
  onAgendamentoCreate?: (start: Date) => void;
  onAgendamentoEdit?: (agendamento: Agendamento) => void;
  /** Editar um evento do Google Calendar (abre o modal de edição). */
  onGoogleEventEdit?: (event: CalEvent) => void;
  /** Incrementar para forçar recarregar os eventos (ex.: após salvar no modal). */
  refreshKey?: number;
  onAgendamentoStatusChange?: () => void;
  /** Cores customizadas por status (configuráveis em Configurações › Workspace). */
  statusColors?: StatusColors;
}

// ─── Main ──────────────────────────────────────────────────────────────────────

export function GCalAgenda({
  agendamentos,
  googleConnected,
  onRefresh,
  onOpenSettings,
  onAgendamentoCreate,
  onAgendamentoEdit,
  onGoogleEventEdit,
  refreshKey,
  statusColors,
}: GCalAgendaProps) {
  // Mescla as cores configuráveis (Agendado/Confirmado/Realizado/Cancelado)
  // com os defaults — "não compareceu" não é configurável ainda, mantém fixo.
  const STATUS_COLOR = useMemo<Record<string, { bg: string; text: string }>>(() => ({
    ...STATUS_COLOR_DEFAULT,
    agendado:   { bg: statusColors?.agendado   ?? STATUS_COLOR_DEFAULT.agendado.bg,   text: "#fff" },
    confirmado: { bg: statusColors?.confirmado ?? STATUS_COLOR_DEFAULT.confirmado.bg, text: "#fff" },
    realizado:  { bg: statusColors?.realizado  ?? STATUS_COLOR_DEFAULT.realizado.bg,  text: "#fff" },
    cancelado:  { bg: statusColors?.cancelado  ?? STATUS_COLOR_DEFAULT.cancelado.bg,  text: "#fff" },
  }), [statusColors]);
  const [view, setView]             = useState<CalView>("month");
  const [current, setCurrent]       = useState(new Date());
  const [googleEvents, setGoogleEvents] = useState<CalEvent[]>([]);
  const [tarefas, setTarefas]       = useState<TarefaLocal[]>([]);
  const [prazos, setPrazos]         = useState<PrazoLocal[]>([]);
  const [loadingGCal, setLoadingGCal] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<CalEvent | null>(null);
  const [popoverAnchor, setPopoverAnchor] = useState<DOMRect | null>(null);
  const [miniCalDate, setMiniCalDate] = useState(new Date());
  const [search, setSearch]         = useState("");
  const [showSearch, setShowSearch] = useState(false);
  // Painel de tarefas
  const [showTarefas, setShowTarefas] = useState(false);
  const [tarefaInput, setTarefaInput] = useState("");
  const [tarefaData, setTarefaData]   = useState("");
  const [tarefaHora, setTarefaHora]   = useState("");
  const [tarefaHoraFim, setTarefaHoraFim] = useState("");
  const [savingTarefa, setSavingTarefa] = useState(false);
  const [editingTarefa, setEditingTarefa] = useState<TarefaLocal | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if ((view === "week" || view === "day") && scrollRef.current) {
      scrollRef.current.scrollTop = Math.max(0, (new Date().getHours() - HORA_MIN - 1) * ALTURA_HORA);
    }
  }, [view]);

  // ─── Fetch Google Events ────────────────────────────────────────────────────

  const fetchGoogleEvents = useCallback(async () => {
    if (!googleConnected) return;
    setLoadingGCal(true);
    try {
      const { timeMin, timeMax } = getViewRange(view, current);
      const res = await agendaFetch(`/api/agenda/events?timeMin=${timeMin.toISOString()}&timeMax=${timeMax.toISOString()}`);
      if (!res.ok) return;
      const { events } = await res.json();
      setGoogleEvents((events ?? []).map((e: any) => {
        const isAllDay = !e.start?.dateTime;
        const start = isAllDay ? parseISO(e.start.date) : parseISO(e.start.dateTime);
        const end   = isAllDay ? parseISO(e.end.date)   : parseISO(e.end.dateTime);
        return {
          id: `g-${e.id}`, title: e.summary ?? "(Sem título)",
          start, end, allDay: isAllDay,
          color: e.backgroundColor ?? "#039be5", textColor: "#fff",
          source: "google", googleId: e.id,
          description: e.description, location: e.location,
        } as CalEvent;
      }));
    } finally { setLoadingGCal(false); }
  }, [googleConnected, current, view]);

  // ─── Fetch Tarefas — busca todas (sem data + com data) ─────────────────────

  const fetchTarefas = useCallback(async () => {
    try {
      return; // tarefas: recurso do SyncroLex
      const res = await agendaFetch("/api/agenda/tarefas");
      if (!res.ok) {
        console.error("fetchTarefas error:", res.status, await res.text());
        return;
      }
      const json = await res.json();
      setTarefas(json.tarefas ?? []);
    } catch (err) {
      console.error("fetchTarefas exception:", err);
    }
  }, []);

  // ─── Fetch Prazos — sempre a versão mais recente do status ────────────────

  const fetchPrazos = useCallback(async () => {
    try {
      return; // prazos: recurso do SyncroLex
      const res = await agendaFetch("/api/agenda/prazos");
      if (!res.ok) return;
      const json = await res.json();
      setPrazos(json.prazos ?? []);
    } catch (err) {
      console.error("fetchPrazos exception:", err);
    }
  }, []);

  useEffect(() => { fetchGoogleEvents(); }, [fetchGoogleEvents, refreshKey]);
  // Tarefas: carrega uma vez ao montar (não depende de range)
  useEffect(() => { fetchTarefas(); }, [fetchTarefas]);
  // Prazos: carrega uma vez ao montar e refaz a cada 30s, para refletir
  // mudanças de status feitas na tela /prazos sem precisar sair da Agenda.
  useEffect(() => {
    fetchPrazos();
    return;
  }, [fetchPrazos]);

  // ─── Merge events ───────────────────────────────────────────────────────────

  const localEvents: CalEvent[] = useMemo(() =>
    agendamentos.map(a => {
      const c = STATUS_COLOR[a.status] ?? STATUS_COLOR.agendado;
      return {
        id: `l-${a.id}`, title: `${a.lead_nome} — ${a.assunto}`,
        start: new Date(a.data_hora_inicio), end: new Date(a.data_hora_fim),
        color: c.bg, textColor: c.text, source: "local" as const, resource: a,
        description: a.observacoes ?? undefined,
      };
    }),
  [agendamentos]);

  const tarefaEvents: CalEvent[] = useMemo(() =>
    tarefas
      .filter(t => t.data_hora)
      .map(t => {
        const start = parseISO(t.data_hora!);
        const end   = t.data_hora_fim ? parseISO(t.data_hora_fim) : new Date(start.getTime() + 30 * 60 * 1000);
        const c     = t.status === "concluida" ? TAREFA_CONCLUIDA_COLOR : TAREFA_COLOR;
        return {
          id: `t-${t.id}`, title: t.titulo,
          start, end, color: c.bg, textColor: c.text,
          source: "tarefa" as const, tarefaId: t.id,
          tarefaConcluida: t.status === "concluida",
        };
      }),
  [tarefas]);

  const prazoEvents: CalEvent[] = useMemo(() =>
    prazos.map(p => {
      const start = new Date(`${p.data_prazo}T00:00:00`);
      const end = new Date(`${p.data_prazo}T23:59:59`);
      const c = PRAZO_STATUS_COLOR[p.status] ?? PRAZO_STATUS_COLOR.pendente;
      return {
        id: `p-${p.id}`, title: `Prazo: ${p.descricao}`,
        start, end, allDay: true,
        color: c.bg, textColor: c.text,
        source: "prazo" as const, prazoStatus: p.status,
        description: p.process_numero ?? p.client_nome ?? undefined,
      };
    }),
  [prazos]);

  const allEvents = useMemo(() => [...localEvents, ...googleEvents, ...tarefaEvents, ...prazoEvents], [localEvents, googleEvents, tarefaEvents, prazoEvents]);

  const filteredEvents = useMemo(() => {
    if (!search.trim()) return allEvents;
    const q = search.toLowerCase();
    return allEvents.filter(e => e.title.toLowerCase().includes(q) || e.description?.toLowerCase().includes(q));
  }, [allEvents, search]);

  // ─── Navigation ─────────────────────────────────────────────────────────────

  function navigate(dir: 1 | -1) {
    if (view === "month")  setCurrent(v => dir > 0 ? addMonths(v, 1) : subMonths(v, 1));
    if (view === "week")   setCurrent(v => dir > 0 ? addWeeks(v, 1)  : subWeeks(v, 1));
    if (view === "day")    setCurrent(v => dir > 0 ? addDays(v, 1)   : subDays(v, 1));
    if (view === "agenda") setCurrent(v => dir > 0 ? addMonths(v, 1) : subMonths(v, 1));
  }

  const headerTitle = useMemo(() => {
    if (view === "month") return format(current, "MMMM yyyy", { locale: ptBR });
    if (view === "week") {
      const s = startOfWeek(current, { weekStartsOn: 0 });
      const e = endOfWeek(current, { weekStartsOn: 0 });
      return isSameMonth(s, e)
        ? format(s, "MMMM yyyy", { locale: ptBR })
        : `${format(s, "MMM", { locale: ptBR })} – ${format(e, "MMM yyyy", { locale: ptBR })}`;
    }
    if (view === "day") return format(current, "d 'de' MMMM yyyy", { locale: ptBR });
    return format(current, "MMMM yyyy", { locale: ptBR });
  }, [current, view]);

  // ─── Event click ────────────────────────────────────────────────────────────

  function handleEventClick(event: CalEvent, rect: DOMRect) {
    setSelectedEvent(event);
    setPopoverAnchor(rect);
  }
  function closePopover() { setSelectedEvent(null); setPopoverAnchor(null); }

  async function handleDeleteGoogleEvent(googleId: string) {
    if (!confirm("Excluir este evento do Google Calendar?")) return;
    await agendaFetch(`/api/agenda/events/${googleId}`, { method: "DELETE" });
    setGoogleEvents(prev => prev.filter(e => e.googleId !== googleId));
    closePopover();
  }

  async function handleToggleTarefa(tarefaId: string, concluida: boolean) {
    await agendaFetch(`/api/agenda/tarefas/${tarefaId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ concluida }),
    });
    setTarefas(prev => prev.map(t =>
      t.id === tarefaId ? { ...t, status: concluida ? "concluida" : "aberta" } : t
    ));
    if (selectedEvent?.tarefaId === tarefaId) {
      setSelectedEvent(prev => prev ? { ...prev, tarefaConcluida: concluida } : null);
    }
  }

  async function handleDeleteTarefa(tarefaId: string) {
    if (!confirm("Excluir esta tarefa?")) return;
    await agendaFetch(`/api/agenda/tarefas/${tarefaId}`, { method: "DELETE" });
    setTarefas(prev => prev.filter(t => t.id !== tarefaId));
    closePopover();
  }

  // ─── Criar tarefa ────────────────────────────────────────────────────────────

  async function handleSaveTarefa(e: React.FormEvent) {
    e.preventDefault();
    if (!tarefaInput.trim()) return;
    setSavingTarefa(true);
    try {
      let data_hora: string | null = null;
      let data_hora_fim: string | null = null;
      if (tarefaData) {
        data_hora = tarefaHora
          ? new Date(`${tarefaData}T${tarefaHora}:00`).toISOString()
          : new Date(`${tarefaData}T08:00:00`).toISOString();
        if (tarefaHoraFim) {
          data_hora_fim = new Date(`${tarefaData}T${tarefaHoraFim}:00`).toISOString();
        }
      }
      const res = await agendaFetch("/api/agenda/tarefas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ titulo: tarefaInput.trim(), data_hora, data_hora_fim }),
      });
      if (res.ok) {
        const { tarefa } = await res.json();
        setTarefas(prev => [...prev, tarefa]);
        setTarefaInput("");
        setTarefaData("");
        setTarefaHora("");
        setTarefaHoraFim("");
        setEditingTarefa(null);
      }
    } finally { setSavingTarefa(false); }
  }

  function openNovaTarefaWithDate(date: Date) {
    setTarefaData(format(date, "yyyy-MM-dd"));
    setTarefaHora(format(date, "HH:mm"));
    setShowTarefas(true);
  }

  // ─── Separar tarefas sem data (mostrar no painel) ────────────────────────────

  const tarefasSemData = useMemo(() =>
    tarefas.filter(t => !t.data_hora).sort((a, b) =>
      new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    ),
  [tarefas]);

  const tarefasHoje = useMemo(() =>
    tarefas.filter(t => t.data_hora && isToday(parseISO(t.data_hora))),
  [tarefas]);

  // ─── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="flex h-full bg-background text-foreground select-none">

      {/* ── Sidebar ─────────────────────────────────────────────────────── */}
      <aside className="hidden lg:flex flex-col w-64 shrink-0 border-r border-border px-4 py-4 gap-4 overflow-y-auto">
        {/* Novo evento */}
        <button
          onClick={() => onAgendamentoCreate?.(current)}
          className="flex items-center gap-3 rounded-2xl border border-border bg-background px-4 py-3 shadow-md hover:shadow-lg transition-shadow text-sm font-medium"
        >
          <Plus className="h-5 w-5 text-primary" />
          Novo evento
        </button>

        {/* Mini calendar */}
        <MiniCal
          current={miniCalDate}
          selected={current}
          onMonthChange={setMiniCalDate}
          onDateClick={d => { setCurrent(d); setMiniCalDate(d); if (view !== "agenda") setView("day"); }}
          events={allEvents}
        />

        {/* Legenda */}
        <div className="space-y-1">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide px-1">Legenda</p>
          {googleConnected && <LegendItem color="#039be5" label="Google Calendar" />}
        </div>

        {/* Google Cal status */}
        {googleConnected ? (
          <div className="flex items-center gap-2 rounded-lg bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 p-2 text-xs text-green-700 dark:text-green-300">
            <div className="h-2 w-2 rounded-full bg-green-500" />
            Google Calendar sincronizado
          </div>
        ) : (
          <button onClick={onOpenSettings} className="flex items-center gap-2 rounded-lg border border-dashed border-border p-3 text-xs text-muted-foreground hover:border-primary/40 hover:text-primary transition-colors">
            <ExternalLink className="h-3.5 w-3.5 shrink-0" />
            Conectar Google Calendar
          </button>
        )}
      </aside>

      {/* ── Área principal ──────────────────────────────────────────────── */}
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">

        {/* Toolbar */}
        <header className="flex items-center gap-2 border-b border-border px-4 py-2 shrink-0 bg-background">
          <button onClick={() => setCurrent(new Date())} className="rounded-lg border border-border px-3 py-1.5 text-sm font-medium hover:bg-accent transition-colors">
            Hoje
          </button>
          <div className="flex items-center">
            <button onClick={() => navigate(-1)} className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-accent"><ChevronLeft className="h-5 w-5" /></button>
            <button onClick={() => navigate(1)}  className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-accent"><ChevronRight className="h-5 w-5" /></button>
          </div>
          <h2 className="flex-1 text-xl font-normal capitalize">{headerTitle}</h2>

          {showSearch ? (
            <div className="flex items-center gap-1 rounded-full border border-border bg-background px-3 py-1">
              <Search className="h-4 w-4 text-muted-foreground" />
              <input autoFocus value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar..." className="bg-transparent text-sm outline-none w-36" />
              <button onClick={() => { setSearch(""); setShowSearch(false); }}><X className="h-3.5 w-3.5 text-muted-foreground" /></button>
            </div>
          ) : (
            <button onClick={() => setShowSearch(true)} className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-accent"><Search className="h-4 w-4" /></button>
          )}

          <button onClick={() => { fetchGoogleEvents(); fetchTarefas(); fetchPrazos(); onRefresh?.(); }} className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-accent" title="Atualizar">
            {loadingGCal ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          </button>

          <button onClick={onOpenSettings} className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-accent"><Settings className="h-4 w-4" /></button>

          {/* Views */}
          <div className="flex items-center rounded-lg border border-border overflow-hidden">
            {(["month", "week", "day", "agenda"] as CalView[]).map(v => (
              <button key={v} onClick={() => setView(v)} className={cn("px-3 py-1.5 text-sm transition-colors", view === v ? "bg-primary/10 text-primary font-medium" : "hover:bg-accent text-muted-foreground")}>
                {v === "month" ? "Mês" : v === "week" ? "Semana" : v === "day" ? "Dia" : "Agenda"}
              </button>
            ))}
          </div>

          <button onClick={() => onAgendamentoCreate?.(current)} className="lg:hidden flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground hover:bg-primary/90">
            <Plus className="h-4 w-4" />
          </button>
        </header>

        {/* Conteúdo */}
        <div className="flex flex-1 overflow-hidden">
          {/* Calendar */}
          <div className="flex-1 overflow-hidden">
            {view === "month"  && <MonthView  current={current} events={filteredEvents} onEventClick={handleEventClick} onCellClick={d => { onAgendamentoCreate?.(d); }} onTarefaCellClick={openNovaTarefaWithDate} />}
            {view === "week"   && <WeekView   current={current} events={filteredEvents} onEventClick={handleEventClick} onCellClick={d => onAgendamentoCreate?.(d)} scrollRef={scrollRef} onTarefaToggle={handleToggleTarefa} />}
            {view === "day"    && <DayView    current={current} events={filteredEvents} onEventClick={handleEventClick} onCellClick={d => onAgendamentoCreate?.(d)} scrollRef={scrollRef} onTarefaToggle={handleToggleTarefa} />}
            {view === "agenda" && <AgendaListView current={current} events={filteredEvents} tarefas={tarefas} onEventClick={handleEventClick} onLoadMore={() => setCurrent(v => addMonths(v, 1))} onTarefaToggle={handleToggleTarefa} onTarefaDelete={handleDeleteTarefa} />}
          </div>

          {/* Painel de Tarefas */}
          {false && showTarefas && (
            <TarefasPanel
              tarefas={tarefas}
              tarefaInput={tarefaInput}
              setTarefaInput={setTarefaInput}
              tarefaData={tarefaData}
              setTarefaData={setTarefaData}
              tarefaHora={tarefaHora}
              setTarefaHora={setTarefaHora}
              tarefaHoraFim={tarefaHoraFim}
              setTarefaHoraFim={setTarefaHoraFim}
              saving={savingTarefa}
              onSave={handleSaveTarefa}
              onToggle={handleToggleTarefa}
              onDelete={handleDeleteTarefa}
              onClose={() => setShowTarefas(false)}
            />
          )}
        </div>
      </div>

      {/* Popover de detalhes */}
      {selectedEvent && popoverAnchor && (
        <EventPopover
          event={selectedEvent}
          anchor={popoverAnchor}
          onClose={closePopover}
          onEdit={() => {
            if (selectedEvent.source === "google") { onGoogleEventEdit?.(selectedEvent); closePopover(); }
            else if (selectedEvent.source === "local" && selectedEvent.resource) {
              onAgendamentoEdit?.(selectedEvent.resource);
              closePopover();
            }
          }}
          onDelete={() => {
            if (selectedEvent.source === "google" && selectedEvent.googleId) handleDeleteGoogleEvent(selectedEvent.googleId);
            else if (selectedEvent.source === "tarefa" && selectedEvent.tarefaId) handleDeleteTarefa(selectedEvent.tarefaId);
            else if (selectedEvent.source === "local" && selectedEvent.resource) { onAgendamentoEdit?.(selectedEvent.resource); closePopover(); }
          }}
          onTarefaToggle={
            selectedEvent.source === "tarefa" && selectedEvent.tarefaId
              ? (c) => handleToggleTarefa(selectedEvent.tarefaId!, c)
              : undefined
          }
        />
      )}
    </div>
  );
}

// ─── Painel de Tarefas ─────────────────────────────────────────────────────────

function TarefasPanel({
  tarefas, tarefaInput, setTarefaInput,
  tarefaData, setTarefaData, tarefaHora, setTarefaHora,
  tarefaHoraFim, setTarefaHoraFim,
  saving, onSave, onToggle, onDelete, onClose,
}: {
  tarefas: TarefaLocal[];
  tarefaInput: string; setTarefaInput: (v: string) => void;
  tarefaData: string;  setTarefaData:  (v: string) => void;
  tarefaHora: string;  setTarefaHora:  (v: string) => void;
  tarefaHoraFim: string; setTarefaHoraFim: (v: string) => void;
  saving: boolean;
  onSave: (e: React.FormEvent) => void;
  onToggle: (id: string, concluida: boolean) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}) {
  const abertas    = tarefas.filter(t => t.status !== "concluida").sort((a, b) => {
    if (!a.data_hora && !b.data_hora) return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    if (!a.data_hora) return 1;
    if (!b.data_hora) return -1;
    return new Date(a.data_hora).getTime() - new Date(b.data_hora).getTime();
  });
  const concluidas = tarefas.filter(t => t.status === "concluida").sort((a, b) =>
    new Date(b.concluida_em ?? b.created_at).getTime() - new Date(a.concluida_em ?? a.created_at).getTime()
  );

  return (
    <div className="w-80 shrink-0 border-l border-border bg-background flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/20">
        <div className="flex items-center gap-2">
          <ListTodo className="h-4 w-4 text-[#137333]" />
          <span className="text-sm font-semibold">Tarefas</span>
          {abertas.length > 0 && (
            <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-[#137333] px-1 text-[10px] text-white font-bold">
              {abertas.length}
            </span>
          )}
        </div>
        <button onClick={onClose} className="p-1 rounded-full hover:bg-accent">
          <X className="h-4 w-4 text-muted-foreground" />
        </button>
      </div>

      {/* Form nova tarefa */}
      <form onSubmit={onSave} className="border-b border-border p-3 space-y-2 bg-[#137333]/3">
        <div className="flex gap-2">
          <input
            value={tarefaInput}
            onChange={e => setTarefaInput(e.target.value)}
            placeholder="Nova tarefa..."
            className="flex-1 rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#137333]/40"
            autoFocus={false}
          />
          <button
            type="submit"
            disabled={saving || !tarefaInput.trim()}
            className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#137333] text-white hover:bg-[#0b6228] disabled:opacity-40 transition-colors shrink-0"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          </button>
        </div>
        {/* Data e hora opcionais */}
        <div className="grid grid-cols-3 gap-1.5">
          <input
            type="date"
            value={tarefaData}
            onChange={e => setTarefaData(e.target.value)}
            className="col-span-3 rounded-md border border-input bg-background px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-[#137333]/40"
            title="Data (opcional)"
          />
          <input
            type="time"
            value={tarefaHora}
            onChange={e => setTarefaHora(e.target.value)}
            placeholder="Início"
            disabled={!tarefaData}
            className="rounded-md border border-input bg-background px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-[#137333]/40 disabled:opacity-40"
            title="Hora início"
          />
          <span className="flex items-center justify-center text-xs text-muted-foreground">até</span>
          <input
            type="time"
            value={tarefaHoraFim}
            onChange={e => setTarefaHoraFim(e.target.value)}
            placeholder="Fim"
            disabled={!tarefaData || !tarefaHora}
            className="rounded-md border border-input bg-background px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-[#137333]/40 disabled:opacity-40"
            title="Hora fim"
          />
        </div>
        <p className="text-[10px] text-muted-foreground/70 px-0.5">
          Sem data = aparece apenas aqui no painel · Com data = aparece no calendário
        </p>
      </form>

      {/* Lista */}
      <div className="flex-1 overflow-y-auto">
        {tarefas.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground gap-2">
            <CheckCheck className="h-8 w-8 opacity-20" />
            <p className="text-xs">Nenhuma tarefa ainda.<br />Adicione acima!</p>
          </div>
        )}

        {/* Tarefas abertas */}
        {abertas.length > 0 && (
          <div className="p-2 space-y-0.5">
            {abertas.map(t => (
              <TarefaItem key={t.id} tarefa={t} onToggle={onToggle} onDelete={onDelete} />
            ))}
          </div>
        )}

        {/* Concluídas */}
        {concluidas.length > 0 && (
          <div className="p-2 space-y-0.5">
            <p className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Concluídas ({concluidas.length})
            </p>
            {concluidas.map(t => (
              <TarefaItem key={t.id} tarefa={t} onToggle={onToggle} onDelete={onDelete} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Item de tarefa ────────────────────────────────────────────────────────────

function TarefaItem({
  tarefa, onToggle, onDelete,
}: {
  tarefa: TarefaLocal;
  onToggle: (id: string, concluida: boolean) => void;
  onDelete: (id: string) => void;
}) {
  const concluida = tarefa.status === "concluida";

  return (
    <div className={cn(
      "group flex items-start gap-2 rounded-lg px-2 py-2 hover:bg-accent/50 transition-colors",
      concluida && "opacity-60"
    )}>
      <button
        onClick={() => onToggle(tarefa.id, !concluida)}
        className="mt-0.5 shrink-0 text-[#137333] hover:scale-110 transition-transform"
      >
        {concluida
          ? <CheckSquare className="h-4 w-4" />
          : <Square className="h-4 w-4" />}
      </button>

      <div className="flex-1 min-w-0">
        <p className={cn("text-sm leading-snug", concluida && "line-through text-muted-foreground")}>
          {tarefa.titulo}
        </p>
        {tarefa.data_hora && (
          <p className="text-[10px] text-muted-foreground mt-0.5 flex items-center gap-1">
            <Clock className="h-2.5 w-2.5" />
            {format(parseISO(tarefa.data_hora), "dd/MM · HH:mm", { locale: ptBR })}
            {tarefa.data_hora_fim && ` – ${format(parseISO(tarefa.data_hora_fim), "HH:mm")}`}
          </p>
        )}
      </div>

      <button
        onClick={() => onDelete(tarefa.id)}
        className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded hover:bg-destructive/10 hover:text-destructive"
      >
        <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
      </button>
    </div>
  );
}

// ─── Mini Calendar ─────────────────────────────────────────────────────────────

function MiniCal({ current, selected, onMonthChange, onDateClick, events }: {
  current: Date; selected: Date;
  onMonthChange: (d: Date) => void;
  onDateClick: (d: Date) => void;
  events: CalEvent[];
}) {
  const weeks = useMemo(() => {
    const s = startOfWeek(startOfMonth(current), { weekStartsOn: 0 });
    const e = endOfWeek(endOfMonth(current), { weekStartsOn: 0 });
    const days = eachDayOfInterval({ start: s, end: e });
    const result: Date[][] = [];
    for (let i = 0; i < days.length; i += 7) result.push(days.slice(i, i + 7));
    return result;
  }, [current]);

  return (
    <div className="text-xs">
      <div className="flex items-center justify-between mb-2">
        <span className="font-medium capitalize">{format(current, "MMMM yyyy", { locale: ptBR })}</span>
        <div className="flex">
          <button onClick={() => onMonthChange(subMonths(current, 1))} className="p-0.5 rounded hover:bg-accent"><ChevronLeft className="h-3.5 w-3.5" /></button>
          <button onClick={() => onMonthChange(addMonths(current, 1))} className="p-0.5 rounded hover:bg-accent"><ChevronRight className="h-3.5 w-3.5" /></button>
        </div>
      </div>
      <div className="grid grid-cols-7 mb-1">
        {["D","S","T","Q","Q","S","S"].map((d, i) => (
          <div key={i} className="text-center text-muted-foreground font-medium">{d}</div>
        ))}
      </div>
      {weeks.map((week, wi) => (
        <div key={wi} className="grid grid-cols-7">
          {week.map((d, di) => (
            <button key={di} onClick={() => onDateClick(d)} className={cn(
              "relative flex flex-col items-center justify-center h-7 w-7 rounded-full mx-auto transition-colors",
              !isSameMonth(d, current) && "opacity-40",
              isSameDay(d, selected) && "bg-primary text-primary-foreground",
              isToday(d) && !isSameDay(d, selected) && "text-primary font-bold",
              !isSameDay(d, selected) && "hover:bg-accent",
            )}>
              {format(d, "d")}
              {events.some(e => isSameDay(e.start, d)) && !isSameDay(d, selected) && (
                <span className="absolute bottom-0.5 h-1 w-1 rounded-full bg-primary" />
              )}
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}

// ─── Month View ────────────────────────────────────────────────────────────────

function MonthView({ current, events, onEventClick, onCellClick, onTarefaCellClick }: {
  current: Date; events: CalEvent[];
  onEventClick: (e: CalEvent, r: DOMRect) => void;
  onCellClick: (d: Date) => void;
  onTarefaCellClick: (d: Date) => void;
}) {
  const weeks = useMemo(() => {
    const s = startOfWeek(startOfMonth(current), { weekStartsOn: 0 });
    const e = endOfWeek(endOfMonth(current), { weekStartsOn: 0 });
    const days = eachDayOfInterval({ start: s, end: e });
    const r: Date[][] = [];
    for (let i = 0; i < days.length; i += 7) r.push(days.slice(i, i + 7));
    return r;
  }, [current]);

  const DOW = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

  return (
    <div className="flex flex-col h-full">
      <div className="grid grid-cols-7 border-b border-border">
        {DOW.map(d => (
          <div key={d} className="py-2 text-center text-xs font-medium text-muted-foreground uppercase tracking-wide">{d}</div>
        ))}
      </div>
      <div className="flex-1 grid" style={{ gridTemplateRows: `repeat(${weeks.length}, 1fr)` }}>
        {weeks.map((week, wi) => (
          <div key={wi} className="grid grid-cols-7 border-b border-border last:border-0">
            {week.map((d, di) => {
              const thisMonth = isSameMonth(d, current);
              const today = isToday(d);
              const dayEvs = events.filter(e => isSameDay(e.start, d)).slice(0, 3);
              const extra  = Math.max(0, events.filter(e => isSameDay(e.start, d)).length - 3);
              return (
                <div key={di} onClick={() => onCellClick(d)} className={cn(
                  "border-r border-border last:border-0 p-1 cursor-pointer hover:bg-accent/30 transition-colors min-h-[90px]",
                  !thisMonth && "bg-muted/30"
                )}>
                  <div className="flex items-center justify-between mb-0.5">
                    <span className={cn(
                      "flex h-7 w-7 items-center justify-center rounded-full text-sm",
                      today ? "bg-primary text-primary-foreground font-bold" : "font-normal",
                      !thisMonth && "text-muted-foreground"
                    )}>{format(d, "d")}</span>
                  </div>
                  <div className="space-y-0.5">
                    {dayEvs.map(ev => (
                      <button key={ev.id} onClick={e => { e.stopPropagation(); onEventClick(ev, e.currentTarget.getBoundingClientRect()); }}
                        className={cn(
                          "w-full text-left rounded px-1.5 py-0.5 text-[11px] truncate font-medium hover:opacity-80 transition-opacity flex items-center gap-1",
                        )}
                        style={{ backgroundColor: ev.color, color: ev.textColor }}
                      >
                        {ev.source === "tarefa" && (
                          ev.tarefaConcluida
                            ? <CheckSquare className="h-2.5 w-2.5 shrink-0" />
                            : <Square className="h-2.5 w-2.5 shrink-0" />
                        )}
                        {ev.source === "prazo" && <Timer className="h-2.5 w-2.5 shrink-0" />}
                        {ev.allDay ? ev.title : `${format(ev.start, "HH:mm")} ${ev.title}`}
                      </button>
                    ))}
                    {extra > 0 && (
                      <p className="px-1.5 text-[11px] text-muted-foreground">+{extra} mais</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Week View ─────────────────────────────────────────────────────────────────

function WeekView({ current, events, onEventClick, onCellClick, scrollRef, onTarefaToggle }: {
  current: Date; events: CalEvent[];
  onEventClick: (e: CalEvent, r: DOMRect) => void;
  onCellClick: (d: Date) => void;
  scrollRef: React.RefObject<HTMLDivElement>;
  onTarefaToggle: (id: string, c: boolean) => void;
}) {
  const days  = useMemo(() => eachDayOfInterval({ start: startOfWeek(current, { weekStartsOn: 0 }), end: endOfWeek(current, { weekStartsOn: 0 }) }), [current]);
  const hours = Array.from({ length: TOTAL_HORAS }, (_, i) => HORA_MIN + i);
  const nowTop = useMemo(() => (new Date().getHours() - HORA_MIN + new Date().getMinutes() / 60) * ALTURA_HORA, []);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex border-b border-border shrink-0 bg-background">
        <div className="w-14 shrink-0" />
        {days.map((d, i) => (
          <div key={i} className={cn("flex-1 text-center py-2 border-l border-border", isToday(d) && "text-primary")}>
            <div className="text-xs text-muted-foreground uppercase">{format(d, "EEE", { locale: ptBR })}</div>
            <div className={cn("mx-auto flex h-9 w-9 items-center justify-center rounded-full text-xl font-normal mt-0.5", isToday(d) && "bg-primary text-primary-foreground")}>
              {format(d, "d")}
            </div>
          </div>
        ))}
      </div>
      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        <div className="flex" style={{ minHeight: TOTAL_HORAS * ALTURA_HORA }}>
          <div className="w-14 shrink-0 relative">
            {hours.map(h => (
              <div key={h} className="absolute w-full text-right pr-2 text-xs text-muted-foreground" style={{ top: (h - HORA_MIN) * ALTURA_HORA - 7 }}>
                {h}:00
              </div>
            ))}
          </div>
          {days.map((d, di) => {
            const colEvs = events.filter(e => !e.allDay && isSameDay(e.start, d));
            const layout = layoutDayEvents(colEvs);
            return (
              <div key={di} className="flex-1 border-l border-border relative" style={{ minHeight: TOTAL_HORAS * ALTURA_HORA }}
                onClick={e => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  const h = Math.floor((e.clientY - rect.top) / ALTURA_HORA) + HORA_MIN;
                  const m = Math.round((((e.clientY - rect.top) % ALTURA_HORA) / ALTURA_HORA) * 60 / 15) * 15;
                  onCellClick(setMinutes(setHours(d, h), m));
                }}
              >
                {hours.map(h => (
                  <div key={h} className="absolute w-full border-t border-border/60" style={{ top: (h - HORA_MIN) * ALTURA_HORA }} />
                ))}
                {isToday(d) && (
                  <div className="absolute left-0 right-0 z-10 flex items-center pointer-events-none" style={{ top: nowTop }}>
                    <div className="h-2.5 w-2.5 rounded-full bg-red-500 -ml-1.5" />
                    <div className="flex-1 h-px bg-red-500" />
                  </div>
                )}
                {layout.map(({ event: ev, col, cols }) => {
                  const top = eventTop(ev.start);
                  const height = eventHeight(ev.start, ev.end);
                  return (
                    <button key={ev.id}
                      onClick={e => { e.stopPropagation(); onEventClick(ev, e.currentTarget.getBoundingClientRect()); }}
                      className="absolute rounded-md px-1.5 py-0.5 text-left overflow-hidden hover:opacity-90 transition-opacity"
                      style={{ top, height: Math.max(height, 22), width: `calc(${100 / cols}% - 2px)`, left: `${(col / cols) * 100}%`, backgroundColor: ev.color, color: ev.textColor, fontSize: 11, zIndex: 5 }}
                    >
                      {ev.source === "tarefa" && (
                        <button onClick={e2 => { e2.stopPropagation(); onTarefaToggle(ev.tarefaId!, !ev.tarefaConcluida); }} className="mr-1">
                          {ev.tarefaConcluida ? <CheckSquare className="h-3 w-3 inline" /> : <Square className="h-3 w-3 inline" />}
                        </button>
                      )}
                      <span className={cn("font-medium", ev.tarefaConcluida && "line-through opacity-70")}>{ev.title}</span>
                      {height > 28 && <div className="opacity-80">{format(ev.start, "HH:mm")} – {format(ev.end, "HH:mm")}</div>}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── Day View ──────────────────────────────────────────────────────────────────

function DayView({ current, events, onEventClick, onCellClick, scrollRef, onTarefaToggle }: {
  current: Date; events: CalEvent[];
  onEventClick: (e: CalEvent, r: DOMRect) => void;
  onCellClick: (d: Date) => void;
  scrollRef: React.RefObject<HTMLDivElement>;
  onTarefaToggle: (id: string, c: boolean) => void;
}) {
  const hours = Array.from({ length: TOTAL_HORAS }, (_, i) => HORA_MIN + i);
  const dayEvs = events.filter(e => !e.allDay && isSameDay(e.start, current));
  const layout = layoutDayEvents(dayEvs);
  const nowTop = (new Date().getHours() - HORA_MIN + new Date().getMinutes() / 60) * ALTURA_HORA;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex items-center border-b border-border px-4 py-3 shrink-0 bg-background">
        <div className={cn("flex items-center gap-2", isToday(current) && "text-primary")}>
          <span className="text-2xl font-normal">{format(current, "d")}</span>
          <div>
            <div className="text-sm font-medium capitalize">{format(current, "EEEE", { locale: ptBR })}</div>
            <div className="text-xs text-muted-foreground">{format(current, "MMMM yyyy", { locale: ptBR })}</div>
          </div>
        </div>
        <div className="ml-auto text-xs text-muted-foreground">{dayEvs.length} evento{dayEvs.length !== 1 && "s"}</div>
      </div>
      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        <div className="flex" style={{ minHeight: TOTAL_HORAS * ALTURA_HORA }}>
          <div className="w-14 shrink-0 relative">
            {hours.map(h => (
              <div key={h} className="absolute w-full text-right pr-2 text-xs text-muted-foreground" style={{ top: (h - HORA_MIN) * ALTURA_HORA - 7 }}>{h}:00</div>
            ))}
          </div>
          <div className="flex-1 border-l border-border relative" style={{ minHeight: TOTAL_HORAS * ALTURA_HORA }}
            onClick={e => {
              const rect = e.currentTarget.getBoundingClientRect();
              const h = Math.floor((e.clientY - rect.top) / ALTURA_HORA) + HORA_MIN;
              const m = Math.round((((e.clientY - rect.top) % ALTURA_HORA) / ALTURA_HORA) * 60 / 15) * 15;
              onCellClick(setMinutes(setHours(current, h), m));
            }}
          >
            {hours.map(h => <div key={h} className="absolute w-full border-t border-border/60" style={{ top: (h - HORA_MIN) * ALTURA_HORA }} />)}
            {isToday(current) && (
              <div className="absolute left-0 right-0 z-10 flex items-center pointer-events-none" style={{ top: nowTop }}>
                <div className="h-2.5 w-2.5 rounded-full bg-red-500 -ml-1.5" />
                <div className="flex-1 h-px bg-red-500" />
              </div>
            )}
            {layout.map(({ event: ev, col, cols }) => {
              const top = eventTop(ev.start);
              const height = eventHeight(ev.start, ev.end);
              return (
                <button key={ev.id}
                  onClick={e => { e.stopPropagation(); onEventClick(ev, e.currentTarget.getBoundingClientRect()); }}
                  className="absolute rounded-md px-2 py-1 text-left overflow-hidden hover:opacity-90 transition-opacity"
                  style={{ top, height: Math.max(height, 22), width: `calc(${100 / cols}% - 2px)`, left: `${(col / cols) * 100}%`, backgroundColor: ev.color, color: ev.textColor, fontSize: 12, zIndex: 5 }}
                >
                  {ev.source === "tarefa" && (
                    <button onClick={e2 => { e2.stopPropagation(); onTarefaToggle(ev.tarefaId!, !ev.tarefaConcluida); }} className="mr-1.5">
                      {ev.tarefaConcluida ? <CheckSquare className="h-3.5 w-3.5 inline" /> : <Square className="h-3.5 w-3.5 inline" />}
                    </button>
                  )}
                  <span className={cn("font-semibold", ev.tarefaConcluida && "line-through opacity-70")}>{ev.title}</span>
                  {height > 28 && <div className="opacity-80">{format(ev.start, "HH:mm")} – {format(ev.end, "HH:mm")}</div>}
                  {height > 48 && ev.location && <div className="opacity-80 flex items-center gap-1 mt-0.5"><MapPin className="h-2.5 w-2.5" />{ev.location}</div>}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Agenda List View ──────────────────────────────────────────────────────────

function AgendaListView({ current, events, tarefas, onEventClick, onLoadMore, onTarefaToggle, onTarefaDelete }: {
  current: Date; events: CalEvent[]; tarefas: TarefaLocal[];
  onEventClick: (e: CalEvent, r: DOMRect) => void;
  onLoadMore: () => void;
  onTarefaToggle: (id: string, c: boolean) => void;
  onTarefaDelete: (id: string) => void;
}) {
  const grouped = useMemo(() => {
    const future = events
      .filter(e => !isBefore(e.end, startOfDay(current)))
      .sort((a, b) => a.start.getTime() - b.start.getTime());
    const map = new Map<string, CalEvent[]>();
    for (const ev of future) {
      const key = format(ev.start, "yyyy-MM-dd");
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(ev);
    }
    return Array.from(map.entries()).map(([key, evs]) => ({ date: parseISO(key), events: evs }));
  }, [events, current]);

  // Tarefas sem data
  const semData = tarefas.filter(t => !t.data_hora && t.status !== "concluida");

  return (
    <div className="overflow-y-auto h-full">
      <div className="max-w-3xl mx-auto py-4 px-4">
        {/* Tarefas sem data */}
        {semData.length > 0 && (
          <div className="flex gap-4 mb-4">
            <div className="shrink-0 w-20 pt-3 text-right">
              <div className="text-xs uppercase text-muted-foreground">Sem data</div>
            </div>
            <div className="flex-1 border-l border-border pl-4 pb-4 pt-3 space-y-1.5">
              {semData.map(t => (
                <div key={t.id} className="flex items-center gap-3 rounded-lg p-2 hover:bg-accent transition-colors group">
                  <button onClick={() => onTarefaToggle(t.id, true)} className="text-[#137333] hover:scale-110 transition-transform">
                    <Square className="h-4 w-4" />
                  </button>
                  <span className="flex-1 text-sm">{t.titulo}</span>
                  <button onClick={() => onTarefaDelete(t.id)} className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 hover:text-destructive">
                    <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {grouped.length === 0 && semData.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 text-muted-foreground gap-3">
            <Calendar className="h-12 w-12 opacity-20" />
            <p className="text-sm">Nenhum evento próximo</p>
            <button onClick={onLoadMore} className="text-sm text-primary hover:underline">Carregar mais →</button>
          </div>
        )}

        {grouped.map(({ date, events: dayEvs }) => (
          <div key={date.toISOString()} className="flex gap-4">
            <div className={cn("shrink-0 w-20 pt-3 text-right", isToday(date) && "text-primary")}>
              <div className="text-xs uppercase text-muted-foreground">{format(date, "EEE", { locale: ptBR })}</div>
              <div className={cn("text-2xl font-light", isToday(date) && "font-semibold")}>{format(date, "d")}</div>
            </div>
            <div className="flex-1 border-l border-border pl-4 pb-4 space-y-1.5 pt-3">
              {dayEvs.map((ev: CalEvent) => (
                <button key={ev.id}
                  onClick={(e: React.MouseEvent<HTMLButtonElement>) => onEventClick(ev, e.currentTarget.getBoundingClientRect())}
                  className="w-full flex items-center gap-3 rounded-lg p-2 text-left hover:bg-accent transition-colors group"
                >
                  {ev.source === "tarefa" ? (
                    <button onClick={e2 => { e2.stopPropagation(); onTarefaToggle(ev.tarefaId!, !ev.tarefaConcluida); }}
                      className="text-[#137333] hover:scale-110 transition-transform shrink-0">
                      {ev.tarefaConcluida ? <CheckSquare className="h-4 w-4" /> : <Square className="h-4 w-4" />}
                    </button>
                  ) : (
                    <div className="mt-1.5 h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: ev.color }} />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className={cn("text-sm font-medium truncate", ev.tarefaConcluida && "line-through text-muted-foreground")}>
                      {ev.title}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {ev.allDay ? "Dia todo" : `${format(ev.start, "HH:mm")} – ${format(ev.end, "HH:mm")}`}
                      {ev.location && ` · ${ev.location}`}
                      {ev.source === "tarefa" && <span className="ml-1.5 text-[#137333]">Tarefa</span>}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        ))}

        {grouped.length > 0 && (
          <div className="flex justify-center pt-4">
            <button onClick={onLoadMore} className="text-sm text-primary hover:underline">Carregar mais →</button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Event Popover ─────────────────────────────────────────────────────────────

function EventPopover({ event, anchor, onClose, onEdit, onDelete, onTarefaToggle }: {
  event: CalEvent; anchor: DOMRect;
  onClose: () => void; onEdit: () => void; onDelete: () => void;
  onTarefaToggle?: (concluida: boolean) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const fn = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onClose(); };
    setTimeout(() => document.addEventListener("mousedown", fn), 0);
    return () => document.removeEventListener("mousedown", fn);
  }, [onClose]);

  const style: React.CSSProperties = {
    position: "fixed", zIndex: 50,
    top: Math.min(anchor.top, window.innerHeight - 360),
    left: anchor.right + 8,
  };
  if (anchor.right + 320 > window.innerWidth) style.left = anchor.left - 320 - 8;

  const isTarefa = event.source === "tarefa";

  return (
    <div ref={ref} className="w-80 rounded-2xl bg-background border border-border shadow-2xl overflow-hidden" style={style}>
      <div className="h-2" style={{ backgroundColor: event.color }} />
      <div className="flex items-start justify-between px-4 pt-3 pb-2">
        <div className="flex items-start gap-2">
          {isTarefa && (
            <button onClick={() => onTarefaToggle?.(!event.tarefaConcluida)} className="mt-0.5 text-[#137333] hover:scale-110 transition-transform shrink-0">
              {event.tarefaConcluida ? <CheckSquare className="h-4 w-4" /> : <Square className="h-4 w-4" />}
            </button>
          )}
          {!isTarefa && event.source === "google" && (
            <svg className="mt-0.5 h-3.5 w-3.5 shrink-0" viewBox="0 0 24 24" fill="none">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
            </svg>
          )}
          <div>
            <h3 className={cn("text-base font-medium leading-tight", event.tarefaConcluida && "line-through text-muted-foreground")}>
              {event.title}
            </h3>
            {isTarefa && (
              <span className={cn("text-xs px-1.5 py-0.5 rounded-full font-medium", event.tarefaConcluida ? "bg-muted text-muted-foreground" : "bg-[#137333]/10 text-[#137333]")}>
                {event.tarefaConcluida ? "Concluída" : "Tarefa pendente"}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-0.5 -mt-0.5">
          {(event.source === "local" || event.source === "google") && (
            <button onClick={onEdit} className="p-1.5 rounded-full hover:bg-accent" title="Editar">
              <Edit2 className="h-3.5 w-3.5 text-muted-foreground" />
            </button>
          )}
          <button onClick={onDelete} className="p-1.5 rounded-full hover:bg-accent" title="Excluir">
            <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
          </button>
          <button onClick={onClose} className="p-1.5 rounded-full hover:bg-accent">
            <X className="h-3.5 w-3.5 text-muted-foreground" />
          </button>
        </div>
      </div>
      <div className="px-4 pb-4 space-y-2">
        <div className="flex items-start gap-3 text-sm">
          <Clock className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
          <div>
            {event.allDay ? (
              <span>{format(event.start, "EEEE, d 'de' MMMM", { locale: ptBR })}</span>
            ) : (
              <>
                <div>{format(event.start, "EEEE, d 'de' MMMM", { locale: ptBR })}</div>
                <div className="text-muted-foreground">{format(event.start, "HH:mm")} – {format(event.end, "HH:mm")}</div>
              </>
            )}
          </div>
        </div>
        {event.location && (
          <div className="flex items-start gap-3 text-sm">
            <MapPin className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
            <span>{event.location}</span>
          </div>
        )}
        {event.description && (
          <div className="flex items-start gap-3 text-sm">
            <AlignLeft className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
            <p className="text-muted-foreground line-clamp-3">{event.description.replace(/<[^>]*>/g, "")}</p>
          </div>
        )}
        {isTarefa && onTarefaToggle && (
          <button
            onClick={() => onTarefaToggle(!event.tarefaConcluida)}
            className={cn(
              "w-full mt-2 flex items-center justify-center gap-2 rounded-lg py-2 text-sm font-medium transition-colors",
              event.tarefaConcluida
                ? "bg-muted text-muted-foreground hover:bg-muted/80"
                : "bg-[#137333] text-white hover:bg-[#0b6228]"
            )}
          >
            <CheckCheck className="h-4 w-4" />
            {event.tarefaConcluida ? "Reabrir tarefa" : "Marcar como concluída"}
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Legend ────────────────────────────────────────────────────────────────────

function LegendItem({ color, label, dot }: { color: string; label: string; dot?: boolean }) {
  return (
    <div className="flex items-center gap-2 px-1 py-0.5">
      {dot
        ? <div className="h-3 w-3 rounded-full shrink-0 border-2" style={{ borderColor: color, backgroundColor: "transparent" }} />
        : <div className="h-3 w-3 rounded-sm shrink-0" style={{ backgroundColor: color }} />}
      <span className="text-xs text-muted-foreground">{label}</span>
    </div>
  );
}
