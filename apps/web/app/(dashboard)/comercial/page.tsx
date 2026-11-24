'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useToast } from '@/components/ui/use-toast'
import { Loader2, Plus, X, Edit2, Calendar, TrendingUp, Users, Clock, AlertTriangle, Download, MoreHorizontal, ChevronLeft, ChevronRight, Trash2, Sparkles, MessageSquare } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { LiveStats } from '@/components/live-stats'
import { CountUp, NEON } from '@/components/futuristic'

type Stage = { id: string; name: string; color: string; order: number; _count: { leads: number } }
type Lead = { id: string; contactId?: string | null; name: string; phone?: string; email?: string; source?: string; notes?: string; value?: number; stageId?: string; stage?: Stage; followUps?: any[]; createdAt: string }
type FollowUp = { id: string; leadId?: string; title: string; notes?: string; scheduledAt: string; status: 'PENDING' | 'DONE' | 'CANCELLED'; lead?: Lead }

const STAGE_COLORS = ['#1565C0', '#2E7D32', '#E65100', '#6A1B9A', '#00838F', '#AD1457', '#F9A825', '#546E7A']

function LeadModal({ open, onClose, stages, lead }: { open: boolean; onClose: () => void; stages: Stage[]; lead?: Lead | null }) {
  const qc = useQueryClient()
  const { toast } = useToast()
  const [form, setForm] = useState({ name: lead?.name ?? '', phone: lead?.phone ?? '', email: lead?.email ?? '', source: lead?.source ?? '', notes: lead?.notes ?? '', value: lead?.value?.toString() ?? '', stageId: lead?.stageId ?? '' })

  const mutation = useMutation({
    mutationFn: (data: any) => lead ? api.patch(`/comercial/leads/${lead.id}`, data) : api.post('/comercial/leads', data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['leads'] }); qc.invalidateQueries({ queryKey: ['comercial-stats'] }); toast({ title: lead ? 'Lead atualizado!' : 'Lead criado!' }); onClose() },
    onError: (err: any) => toast({ title: 'Erro ao salvar lead', description: err?.response?.data?.error === 'Dados inválidos' ? 'Confira o e-mail e o valor informados.' : (err?.response?.data?.error || 'Tente novamente.'), variant: 'destructive' }),
  })

  function submit(e: React.FormEvent) {
    e.preventDefault()
    mutation.mutate({
      ...form,
      // campo em branco vai como null: o servidor recusava e-mail vazio como "inválido"
      phone: form.phone.trim() || null,
      email: form.email.trim() || null,
      source: form.source.trim() || null,
      notes: form.notes.trim() || null,
      value: form.value ? parseFloat(form.value) : null,
      stageId: form.stageId || null,
    })
  }

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose() }}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>{lead ? 'Editar Lead' : 'Novo Lead'}</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="space-y-3 mt-2">
          <div><Label>Nome *</Label><Input className="mt-1" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} required /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Telefone</Label><Input className="mt-1" placeholder="+55..." value={form.phone} onChange={e => setForm(p => ({ ...p, phone: e.target.value }))} /></div>
            <div><Label>E-mail</Label><Input className="mt-1" type="email" value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Origem</Label><Input className="mt-1" placeholder="WhatsApp, site..." value={form.source} onChange={e => setForm(p => ({ ...p, source: e.target.value }))} /></div>
            <div><Label>Valor (R$)</Label><Input className="mt-1" type="number" min="0" step="0.01" value={form.value} onChange={e => setForm(p => ({ ...p, value: e.target.value }))} /></div>
          </div>
          <div>
            <Label>Etapa</Label>
            <select className="w-full mt-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1565C0]" value={form.stageId} onChange={e => setForm(p => ({ ...p, stageId: e.target.value }))}>
              <option value="">Sem etapa</option>
              {stages.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div><Label>Observações</Label><textarea className="w-full mt-1 border border-input rounded-md px-3 py-2 text-sm h-20 resize-none focus:outline-none focus:ring-2 focus:ring-ring" value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} /></div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
            <Button type="submit" disabled={mutation.isPending} className="bg-gradient-to-r from-[#1D4ED8] to-[#7C3AED] hover:opacity-90 text-white">
              {mutation.isPending && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              {lead ? 'Salvar' : 'Criar lead'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function FollowUpModal({ open, onClose, leads, leadId }: { open: boolean; onClose: () => void; leads: Lead[]; leadId?: string }) {
  const qc = useQueryClient()
  const { toast } = useToast()
  const [form, setForm] = useState({ title: '', notes: '', scheduledAt: '', leadId: leadId ?? '' })

  const mutation = useMutation({
    mutationFn: (data: any) => api.post('/comercial/followups', data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['followups'] }); qc.invalidateQueries({ queryKey: ['leads'] }); toast({ title: 'Follow-up agendado!' }); onClose() },
    onError: () => toast({ title: 'Erro ao agendar', variant: 'destructive' }),
  })

  function submit(e: React.FormEvent) {
    e.preventDefault()
    mutation.mutate({ ...form, leadId: form.leadId || null, scheduledAt: new Date(form.scheduledAt).toISOString() })
  }

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose() }}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Agendar Follow-up</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="space-y-3 mt-2">
          <div><Label>Título *</Label><Input className="mt-1" placeholder="Ligar para cliente, Enviar proposta..." value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))} required /></div>
          <div>
            <Label>Lead</Label>
            <select className="w-full mt-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1565C0]" value={form.leadId} onChange={e => setForm(p => ({ ...p, leadId: e.target.value }))}>
              <option value="">Nenhum</option>
              {leads.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </div>
          <div><Label>Data e hora *</Label><Input className="mt-1" type="datetime-local" value={form.scheduledAt} onChange={e => setForm(p => ({ ...p, scheduledAt: e.target.value }))} required /></div>
          <div><Label>Observações</Label><textarea className="w-full mt-1 border border-input rounded-md px-3 py-2 text-sm h-20 resize-none focus:outline-none focus:ring-2 focus:ring-ring" value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} /></div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
            <Button type="submit" disabled={mutation.isPending} className="bg-gradient-to-r from-[#1D4ED8] to-[#7C3AED] hover:opacity-90 text-white">
              {mutation.isPending && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              Agendar
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function LeadCard({ lead, color, onEdit, onDelete, onFollowUp, onChat }: { lead: Lead; color: string; onEdit: () => void; onDelete: () => void; onFollowUp: () => void; onChat?: () => void }) {
  const nextFollowUp = lead.followUps?.[0]
  const isOverdue = nextFollowUp && new Date(nextFollowUp.scheduledAt) < new Date()

  return (
    <div className="relative rounded-xl border border-border/70 bg-card p-3 pl-4 shadow-sm hover:shadow-lg hover:-translate-y-0.5 transition-all cursor-grab active:cursor-grabbing group overflow-hidden">
      <span className="absolute left-0 top-0 bottom-0 w-1" style={{ background: color, boxShadow: `0 0 12px ${color}` }} />
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0" onClick={onEdit}>
          <div className="font-medium text-sm truncate text-foreground">{lead.name}</div>
          {lead.phone && <div className="text-xs text-muted-foreground mt-0.5">{lead.phone}</div>}
          {!!lead.value && <div className="text-xs font-semibold text-emerald-500 mt-1">R$ {lead.value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div>}
          {lead.source && <div className="text-[10px] uppercase tracking-wide text-muted-foreground mt-1 bg-muted px-1.5 py-0.5 rounded inline-block">{lead.source}</div>}
        </div>
        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
          {onChat && lead.contactId && (
            <button onClick={onChat} className="p-1 hover:bg-emerald-500/10 rounded text-muted-foreground hover:text-emerald-500" title="Abrir conversa"><MessageSquare className="w-3.5 h-3.5" /></button>
          )}
          <button onClick={onFollowUp} className="p-1 hover:bg-muted rounded text-muted-foreground hover:text-primary" title="Agendar follow-up"><Calendar className="w-3.5 h-3.5" /></button>
          <button onClick={onEdit} className="p-1 hover:bg-muted rounded text-muted-foreground hover:text-foreground" title="Editar"><Edit2 className="w-3.5 h-3.5" /></button>
          <button onClick={onDelete} className="p-1 hover:bg-rose-500/10 rounded text-muted-foreground hover:text-rose-500" title="Remover"><X className="w-3.5 h-3.5" /></button>
        </div>
      </div>
      {nextFollowUp && (
        <div className={cn('mt-2 flex items-center gap-1 text-xs px-2 py-1 rounded-lg', isOverdue ? 'bg-rose-500/10 text-rose-500' : 'bg-primary/10 text-primary')}>
          {isOverdue ? <AlertTriangle className="w-3 h-3" /> : <Clock className="w-3 h-3" />}
          {new Date(nextFollowUp.scheduledAt).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
        </div>
      )}
    </div>
  )
}

/** Cabeçalho de uma etapa: renomear, trocar cor, mover e excluir — tudo livre para o cliente. */
function StageHeader({ stage, count, total, index, last, onRename, onColor, onMove, onDelete }: {
  stage: Stage; count: number; total: number; index: number; last: boolean
  onRename: (name: string) => void; onColor: (color: string) => void; onMove: (dir: -1 | 1) => void; onDelete: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(stage.name)
  const [menu, setMenu] = useState(false)

  function commit() {
    const n = name.trim()
    setEditing(false)
    if (n && n !== stage.name) onRename(n)
    else setName(stage.name)
  }

  return (
    <div className="relative mb-3 rounded-xl px-3 py-2.5 text-white"
      style={{ background: `linear-gradient(135deg, ${stage.color}, ${stage.color}b3)`, boxShadow: `0 8px 20px -10px ${stage.color}` }}>
      <div className="absolute inset-0 rounded-xl sf-grid-bg opacity-60 pointer-events-none" />
      <div className="relative flex items-center gap-2">
        {editing ? (
          <input autoFocus value={name} onChange={e => setName(e.target.value)} onBlur={commit}
            onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') { setName(stage.name); setEditing(false) } }}
            className="flex-1 min-w-0 bg-white/20 rounded-md px-2 py-0.5 text-sm font-semibold outline-none placeholder-white/60" maxLength={100} />
        ) : (
          <button onClick={() => setEditing(true)} title="Clique para renomear"
            className="flex-1 min-w-0 text-left text-sm font-semibold truncate">{stage.name}</button>
        )}
        <span className="text-xs font-bold bg-white/25 rounded-full px-2 py-0.5 tabular-nums">{count}</span>
        <button onClick={() => setMenu(m => !m)} className="p-1 rounded-md hover:bg-white/20" aria-label="Opções da etapa"><MoreHorizontal className="w-4 h-4" /></button>
      </div>
      {total > 0 && <div className="relative text-[11px] opacity-90 mt-0.5">R$ {total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} em oportunidades</div>}

      {menu && (
        <>
          <div className="fixed inset-0 z-20" onClick={() => setMenu(false)} />
          <div className="absolute right-2 top-10 z-30 w-56 rounded-xl bg-card text-foreground border border-border shadow-2xl p-2">
            <button onClick={() => { setMenu(false); setEditing(true) }} className="w-full flex items-center gap-2 px-2 py-1.5 text-sm rounded-lg hover:bg-muted"><Edit2 className="w-3.5 h-3.5" />Renomear</button>
            <button disabled={index === 0} onClick={() => { setMenu(false); onMove(-1) }} className="w-full flex items-center gap-2 px-2 py-1.5 text-sm rounded-lg hover:bg-muted disabled:opacity-40"><ChevronLeft className="w-3.5 h-3.5" />Mover para a esquerda</button>
            <button disabled={last} onClick={() => { setMenu(false); onMove(1) }} className="w-full flex items-center gap-2 px-2 py-1.5 text-sm rounded-lg hover:bg-muted disabled:opacity-40"><ChevronRight className="w-3.5 h-3.5" />Mover para a direita</button>
            <div className="px-2 pt-2 pb-1">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">Cor da etapa</div>
              <div className="flex flex-wrap gap-1.5">
                {STAGE_COLORS.map(c => (
                  <button key={c} onClick={() => { onColor(c); setMenu(false) }} aria-label={`Cor ${c}`}
                    className={cn('w-6 h-6 rounded-full ring-offset-2 ring-offset-card transition-transform hover:scale-110', stage.color.toLowerCase() === c.toLowerCase() && 'ring-2 ring-foreground')}
                    style={{ background: c }} />
                ))}
              </div>
            </div>
            <div className="border-t border-border my-1.5" />
            <button onClick={() => { setMenu(false); onDelete() }} className="w-full flex items-center gap-2 px-2 py-1.5 text-sm rounded-lg text-rose-500 hover:bg-rose-500/10"><Trash2 className="w-3.5 h-3.5" />Excluir etapa</button>
          </div>
        </>
      )}
    </div>
  )
}

const TABS = ['Pipeline', 'Follow-ups'] as const
type Tab = typeof TABS[number]

function Stat({ icon: Icon, label, value, color, alert }: { icon: any; label: string; value: number; color: string; alert?: boolean }) {
  return (
    <div className="sf-panel sf-rise !p-4" style={{ ['--accent-a' as any]: color, ['--accent-b' as any]: 'transparent' }}>
      <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1.5">
        <span className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: `${color}22`, boxShadow: `0 0 14px ${color}33` }}><Icon className="w-4 h-4" style={{ color }} /></span>
        {label}
      </div>
      <CountUp value={value} className={cn('text-2xl font-bold tabular-nums', alert && value > 0 ? 'text-rose-500' : 'text-foreground')} />
    </div>
  )
}

export default function ComercialPage() {
  const qc = useQueryClient()
  const { toast } = useToast()
  const router = useRouter()
  const { data: crmConnections = [] } = useQuery<any[]>({ queryKey: ['crm-connections'], queryFn: () => api.get('/crm/connections').then(r => r.data) })
  const syncrolex = crmConnections.find(c => c.platform === 'syncrolex' && c.status === 'active')
  const [activeTab, setActiveTab] = useState<Tab>('Pipeline')
  const [showLeadModal, setShowLeadModal] = useState(false)
  const [editingLead, setEditingLead] = useState<Lead | null>(null)
  const [showFollowUpModal, setShowFollowUpModal] = useState(false)
  const [followUpLeadId, setFollowUpLeadId] = useState<string | undefined>()
  const [showStageForm, setShowStageForm] = useState(false)
  const [newStageName, setNewStageName] = useState('')

  const { data: stages = [] } = useQuery<Stage[]>({ queryKey: ['stages'], queryFn: () => api.get('/comercial/stages').then(r => r.data) })
  const { data: leads = [] } = useQuery<Lead[]>({ queryKey: ['leads'], queryFn: () => api.get('/comercial/leads').then(r => r.data) })
  const { data: followUps = [], isLoading: loadingFollowUps } = useQuery<FollowUp[]>({ queryKey: ['followups'], queryFn: () => api.get('/comercial/followups').then(r => r.data) })

  const refreshStages = () => { qc.invalidateQueries({ queryKey: ['stages'] }); qc.invalidateQueries({ queryKey: ['comercial-stats'] }); qc.invalidateQueries({ queryKey: ['analytics-business'] }) }
  const refreshLeads = () => { qc.invalidateQueries({ queryKey: ['leads'] }); qc.invalidateQueries({ queryKey: ['stages'] }); qc.invalidateQueries({ queryKey: ['comercial-stats'] }); qc.invalidateQueries({ queryKey: ['analytics-business'] }) }

  const createStage = useMutation({
    mutationFn: (name: string) => api.post('/comercial/stages', { name: name.trim(), color: STAGE_COLORS[stages.length % STAGE_COLORS.length] }),
    onSuccess: () => { refreshStages(); setNewStageName(''); setShowStageForm(false) },
    onError: () => toast({ title: 'Erro ao criar etapa', variant: 'destructive' }),
  })

  const updateStage = useMutation({
    mutationFn: ({ id, ...data }: { id: string; name?: string; color?: string }) => api.patch(`/comercial/stages/${id}`, data),
    onSuccess: refreshStages,
    onError: () => toast({ title: 'Erro ao atualizar etapa', variant: 'destructive' }),
  })

  const deleteStage = useMutation({
    mutationFn: (id: string) => api.delete(`/comercial/stages/${id}`),
    onSuccess: () => { refreshStages(); refreshLeads(); toast({ title: 'Etapa excluída', description: 'Os leads dela foram para "Sem etapa".' }) },
    onError: () => toast({ title: 'Erro ao excluir etapa', variant: 'destructive' }),
  })

  const reorderStages = useMutation({
    mutationFn: (order: string[]) => api.post('/comercial/stages/reorder', { order }),
    onSuccess: refreshStages,
  })

  const addDefaults = useMutation({
    mutationFn: () => api.post('/comercial/stages/defaults'),
    onSuccess: () => { refreshStages(); toast({ title: 'Etapas do modelo padrão adicionadas' }) },
    onError: () => toast({ title: 'Erro ao adicionar modelo', variant: 'destructive' }),
  })

  // Abre (ou reaproveita) a conversa com o contato do lead e vai para o chat.
  const openChatMutation = useMutation({
    mutationFn: (contactId: string) => api.post('/conversations/start', { contactId }).then(r => r.data),
    onSuccess: (conv) => router.push(`/chat?conversationId=${conv.id}`),
    onError: (err: any) => toast({ title: 'Não foi possível abrir a conversa', description: err?.response?.data?.error || 'Tente novamente.', variant: 'destructive' }),
  })

  const deleteLead = useMutation({
    mutationFn: (id: string) => api.delete(`/comercial/leads/${id}`),
    onSuccess: refreshLeads,
  })

  const moveLead = useMutation({
    mutationFn: ({ id, stageId }: { id: string; stageId: string | null }) => api.patch(`/comercial/leads/${id}`, { stageId }),
    onSuccess: refreshLeads,
  })

  const markFollowUpDone = useMutation({
    mutationFn: (id: string) => api.patch(`/comercial/followups/${id}`, { status: 'DONE' }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['followups'] }); qc.invalidateQueries({ queryKey: ['leads'] }) },
  })

  const deleteFollowUp = useMutation({
    mutationFn: (id: string) => api.delete(`/comercial/followups/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['followups'] }),
  })

  const unstagedLeads = leads.filter(l => !l.stageId)
  const pendingFollowUps = followUps.filter(f => f.status === 'PENDING')
  const overdueFollowUps = pendingFollowUps.filter(f => new Date(f.scheduledAt) < new Date())

  function moveStage(index: number, dir: -1 | 1) {
    const ids = stages.map(s => s.id)
    const j = index + dir
    if (j < 0 || j >= ids.length) return
    ;[ids[index], ids[j]] = [ids[j], ids[index]]
    reorderStages.mutate(ids)
  }

  function exportCSV() {
    const rows = [['Nome', 'Telefone', 'E-mail', 'Origem', 'Valor', 'Etapa', 'Criado em']]
    leads.forEach((l: Lead) => rows.push([l.name, l.phone ?? '', l.email ?? '', l.source ?? '', l.value?.toString() ?? '', l.stage?.name ?? '', new Date(l.createdAt).toLocaleDateString('pt-BR')]))
    const csv = rows.map(r => r.map(c => `"${c.replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = 'leads.csv'; a.click()
    URL.revokeObjectURL(url)
  }

  const dropOn = (stageId: string | null) => ({
    onDragOver: (e: React.DragEvent) => e.preventDefault(),
    onDrop: (e: React.DragEvent) => {
      e.preventDefault()
      const leadId = e.dataTransfer.getData('leadId')
      if (leadId) moveLead.mutate({ id: leadId, stageId })
    },
  })

  const card = (lead: Lead, color: string) => (
    <div key={lead.id} draggable onDragStart={e => e.dataTransfer.setData('leadId', lead.id)}>
      <LeadCard lead={lead} color={color}
        onEdit={() => { setEditingLead(lead); setShowLeadModal(true) }}
        onDelete={() => { if (confirm(`Remover ${lead.name}?`)) deleteLead.mutate(lead.id) }}
        onFollowUp={() => { setFollowUpLeadId(lead.id); setShowFollowUpModal(true) }}
        onChat={() => { if (lead.contactId) openChatMutation.mutate(lead.contactId) }} />
    </div>
  )

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight bg-gradient-to-r from-[#1D4ED8] via-[#7C3AED] to-[#EC4899] bg-clip-text text-transparent w-fit">Comercial</h1>
          <p className="text-muted-foreground text-sm mt-1">Pipeline de vendas e acompanhamento de leads</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" className="flex items-center gap-2" onClick={exportCSV}>
            <Download className="w-4 h-4" />
            Exportar CSV
          </Button>
          <Button onClick={() => { setShowFollowUpModal(true); setFollowUpLeadId(undefined) }} variant="outline" className="flex items-center gap-2">
            <Calendar className="w-4 h-4" />
            Follow-up
          </Button>
          <Button onClick={() => { setEditingLead(null); setShowLeadModal(true) }} className="bg-gradient-to-r from-[#1D4ED8] to-[#7C3AED] hover:opacity-90 text-white flex items-center gap-2 shadow-lg shadow-violet-500/30">
            <Plus className="w-4 h-4" />
            Novo lead
          </Button>
        </div>
      </div>

      {/* Mesmos números ao vivo do Dashboard */}
      <LiveStats />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Stat icon={Users} label="Total de leads" value={leads.length} color={NEON.cyan} />
        <Stat icon={TrendingUp} label="Etapas do funil" value={stages.length} color={NEON.violet} />
        <Stat icon={Clock} label="Follow-ups pendentes" value={pendingFollowUps.length} color={NEON.amber} />
        <Stat icon={AlertTriangle} label="Atrasados" value={overdueFollowUps.length} color={NEON.pink} alert />
      </div>

      <div className="border-b border-border">
        <div className="flex gap-6">
          {TABS.map(t => (
            <button key={t} onClick={() => setActiveTab(t)}
              className={cn('pb-3 text-sm font-medium border-b-2 transition-colors', activeTab === t ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground')}>
              {t}
              {t === 'Follow-ups' && overdueFollowUps.length > 0 && (
                <span className="ml-2 bg-rose-500 text-white text-xs rounded-full px-1.5 py-0.5">{overdueFollowUps.length}</span>
              )}
            </button>
          ))}
        </div>
      </div>

      {activeTab === 'Pipeline' && (
        <>
          {syncrolex && (
            <p className="text-xs text-muted-foreground">
              Os leads novos também são enviados ao SyncroLex
              {syncrolex.lastDispatch
                ? (syncrolex.lastDispatch.ok ? ' (último envio com sucesso).' : ' (atenção: o último envio falhou, veja em Integrações).')
                : '.'}
            </p>
          )}
          <div className="flex items-center justify-between flex-wrap gap-2 text-xs text-muted-foreground">
            <span>Arraste os leads entre as etapas. Clique no nome da etapa para renomear; no menu <MoreHorizontal className="inline w-3.5 h-3.5" /> você muda a cor, a ordem ou exclui.</span>
            <button onClick={() => addDefaults.mutate()} disabled={addDefaults.isPending}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 font-medium text-foreground hover:bg-muted disabled:opacity-50">
              <Sparkles className="w-3.5 h-3.5 text-violet-500" />Adicionar etapas do modelo padrão
            </button>
          </div>

          <div className="overflow-x-auto pb-4">
            <div className="flex gap-4 min-w-max items-start">
              {unstagedLeads.length > 0 && (
                <div className="w-72 shrink-0">
                  <div className="mb-3 rounded-xl px-3 py-2.5 bg-slate-500/90 text-white flex items-center justify-between">
                    <span className="text-sm font-semibold">Sem etapa</span>
                    <span className="text-xs font-bold bg-white/25 rounded-full px-2 py-0.5 tabular-nums">{unstagedLeads.length}</span>
                  </div>
                  <div className="space-y-2 min-h-[100px] rounded-2xl p-2 bg-muted/50 border border-dashed border-border" {...dropOn(null)}>
                    {unstagedLeads.map(l => card(l, '#94A3B8'))}
                  </div>
                </div>
              )}

              {stages.map((stage, idx) => {
                const stageLeads = leads.filter(l => l.stageId === stage.id)
                const total = stageLeads.reduce((s, l) => s + (l.value || 0), 0)
                return (
                  <div key={stage.id} className="w-72 shrink-0">
                    <StageHeader stage={stage} count={stageLeads.length} total={total} index={idx} last={idx === stages.length - 1}
                      onRename={name => updateStage.mutate({ id: stage.id, name })}
                      onColor={color => updateStage.mutate({ id: stage.id, color })}
                      onMove={dir => moveStage(idx, dir)}
                      onDelete={() => { if (confirm(`Excluir a etapa "${stage.name}"? Os ${stageLeads.length} lead(s) dela ficam em "Sem etapa".`)) deleteStage.mutate(stage.id) }} />
                    <div className="space-y-2 min-h-[100px] rounded-2xl p-2 border border-border/60"
                      style={{ background: `linear-gradient(180deg, ${stage.color}14, transparent 70%)` }} {...dropOn(stage.id)}>
                      {stageLeads.map(l => card(l, stage.color))}
                      {stageLeads.length === 0 && <div className="text-xs text-muted-foreground text-center py-6">Arraste leads aqui</div>}
                    </div>
                  </div>
                )
              })}

              <div className="w-72 shrink-0">
                {showStageForm ? (
                  <div className="sf-panel !p-3">
                    <Input placeholder="Nome da etapa" value={newStageName} onChange={e => setNewStageName(e.target.value)} autoFocus maxLength={100}
                      onKeyDown={e => { if (e.key === 'Enter' && newStageName.trim()) createStage.mutate(newStageName); if (e.key === 'Escape') setShowStageForm(false) }} />
                    <div className="flex gap-2 mt-2">
                      <Button size="sm" onClick={() => createStage.mutate(newStageName)} disabled={!newStageName.trim() || createStage.isPending} className="bg-gradient-to-r from-[#1D4ED8] to-[#7C3AED] text-white">Criar</Button>
                      <Button size="sm" variant="outline" onClick={() => setShowStageForm(false)}>Cancelar</Button>
                    </div>
                  </div>
                ) : (
                  <button onClick={() => setShowStageForm(true)} className="w-full h-12 rounded-xl border-2 border-dashed border-border text-muted-foreground hover:border-violet-500 hover:text-violet-500 hover:bg-violet-500/5 transition-colors flex items-center justify-center gap-2 text-sm">
                    <Plus className="w-4 h-4" /> Nova etapa
                  </button>
                )}
              </div>
            </div>
          </div>
        </>
      )}

      {activeTab === 'Follow-ups' && (
        <div className="space-y-3">
          {loadingFollowUps ? (
            <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
          ) : pendingFollowUps.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              <Calendar className="w-10 h-10 mx-auto mb-3 opacity-40" />
              <p>Nenhum follow-up pendente</p>
              <Button onClick={() => { setShowFollowUpModal(true); setFollowUpLeadId(undefined) }} className="mt-4 bg-gradient-to-r from-[#1D4ED8] to-[#7C3AED] text-white">Agendar primeiro follow-up</Button>
            </div>
          ) : (
            pendingFollowUps.map(fu => {
              const overdue = new Date(fu.scheduledAt) < new Date()
              return (
                <div key={fu.id} className={cn('sf-panel !p-4 flex items-start justify-between gap-4', overdue && '!border-rose-500/40')}
                  style={{ ['--accent-a' as any]: overdue ? NEON.pink : NEON.cyan, ['--accent-b' as any]: 'transparent' }}>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      {overdue && <AlertTriangle className="w-4 h-4 text-rose-500 shrink-0" />}
                      <span className="font-medium text-foreground">{fu.title}</span>
                    </div>
                    {fu.lead && <div className="text-sm text-muted-foreground mt-0.5">Lead: {fu.lead.name}</div>}
                    {fu.notes && <div className="text-sm text-muted-foreground/80 mt-1">{fu.notes}</div>}
                    <div className={cn('text-xs mt-1 font-medium', overdue ? 'text-rose-500' : 'text-primary')}>
                      {new Date(fu.scheduledAt).toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                      {overdue && ' — ATRASADO'}
                    </div>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <Button size="sm" onClick={() => markFollowUpDone.mutate(fu.id)} disabled={markFollowUpDone.isPending} variant="outline" className="text-emerald-600 border-emerald-500/40 hover:bg-emerald-500/10">Concluído</Button>
                    <button onClick={() => deleteFollowUp.mutate(fu.id)} className="p-2 hover:bg-rose-500/10 rounded text-muted-foreground hover:text-rose-500"><X className="w-4 h-4" /></button>
                  </div>
                </div>
              )
            })
          )}
        </div>
      )}

      <LeadModal key={`${editingLead?.id ?? 'new'}-${showLeadModal}`} open={showLeadModal} onClose={() => { setShowLeadModal(false); setEditingLead(null) }} stages={stages} lead={editingLead} />
      <FollowUpModal key={`${followUpLeadId ?? 'none'}-${showFollowUpModal}`} open={showFollowUpModal} onClose={() => setShowFollowUpModal(false)} leads={leads} leadId={followUpLeadId} />
    </div>
  )
}
