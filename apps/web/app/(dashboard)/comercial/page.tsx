'use client'
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useToast } from '@/components/ui/use-toast'
import { Loader2, Plus, X, Edit2, Calendar, TrendingUp, Users, Clock, AlertTriangle, Download } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'

type Stage = { id: string; name: string; color: string; order: number; _count: { leads: number } }
type Lead = { id: string; name: string; phone?: string; email?: string; source?: string; notes?: string; value?: number; stageId?: string; stage?: Stage; followUps?: any[]; createdAt: string }
type FollowUp = { id: string; leadId?: string; title: string; notes?: string; scheduledAt: string; status: 'PENDING' | 'DONE' | 'CANCELLED'; lead?: Lead }

const STAGE_COLORS = ['#1565C0', '#2E7D32', '#E65100', '#6A1B9A', '#00838F', '#AD1457', '#F9A825', '#546E7A']

function LeadModal({ open, onClose, stages, lead }: { open: boolean; onClose: () => void; stages: Stage[]; lead?: Lead | null }) {
  const qc = useQueryClient()
  const { toast } = useToast()
  const [form, setForm] = useState({ name: lead?.name ?? '', phone: lead?.phone ?? '', email: lead?.email ?? '', source: lead?.source ?? '', notes: lead?.notes ?? '', value: lead?.value?.toString() ?? '', stageId: lead?.stageId ?? '' })

  const mutation = useMutation({
    mutationFn: (data: any) => lead ? api.patch(`/comercial/leads/${lead.id}`, data) : api.post('/comercial/leads', data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['leads'] }); qc.invalidateQueries({ queryKey: ['comercial-stats'] }); toast({ title: lead ? 'Lead atualizado!' : 'Lead criado!' }); onClose() },
    onError: () => toast({ title: 'Erro ao salvar lead', variant: 'destructive' }),
  })

  function submit(e: React.FormEvent) {
    e.preventDefault()
    mutation.mutate({ ...form, value: form.value ? parseFloat(form.value) : null, stageId: form.stageId || null })
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
            <Button type="submit" disabled={mutation.isPending} className="bg-[#1565C0] hover:bg-[#1565C0]/90 text-white">
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
            <Button type="submit" disabled={mutation.isPending} className="bg-[#1565C0] hover:bg-[#1565C0]/90 text-white">
              {mutation.isPending && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              Agendar
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function LeadCard({ lead, onEdit, onDelete, onFollowUp }: { lead: Lead; onEdit: () => void; onDelete: () => void; onFollowUp: () => void }) {
  const nextFollowUp = lead.followUps?.[0]
  const isOverdue = nextFollowUp && new Date(nextFollowUp.scheduledAt) < new Date()

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-3 shadow-sm hover:shadow-md transition-shadow cursor-pointer group">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0" onClick={onEdit}>
          <div className="font-medium text-gray-900 text-sm truncate">{lead.name}</div>
          {lead.phone && <div className="text-xs text-gray-400 mt-0.5">{lead.phone}</div>}
          {lead.value && <div className="text-xs font-semibold text-green-600 mt-1">R$ {lead.value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div>}
          {lead.source && <div className="text-xs text-gray-400 mt-0.5 bg-gray-50 px-1.5 py-0.5 rounded inline-block">{lead.source}</div>}
        </div>
        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
          <button onClick={onFollowUp} className="p-1 hover:bg-blue-50 rounded text-gray-400 hover:text-[#1565C0]" title="Agendar follow-up"><Calendar className="w-3.5 h-3.5" /></button>
          <button onClick={onEdit} className="p-1 hover:bg-gray-100 rounded text-gray-400 hover:text-gray-600" title="Editar"><Edit2 className="w-3.5 h-3.5" /></button>
          <button onClick={onDelete} className="p-1 hover:bg-red-50 rounded text-gray-400 hover:text-red-500" title="Remover"><X className="w-3.5 h-3.5" /></button>
        </div>
      </div>
      {nextFollowUp && (
        <div className={cn('mt-2 flex items-center gap-1 text-xs px-2 py-1 rounded', isOverdue ? 'bg-red-50 text-red-600' : 'bg-blue-50 text-[#1565C0]')}>
          {isOverdue ? <AlertTriangle className="w-3 h-3" /> : <Clock className="w-3 h-3" />}
          {new Date(nextFollowUp.scheduledAt).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
        </div>
      )}
    </div>
  )
}

const TABS = ['Pipeline', 'Follow-ups'] as const
type Tab = typeof TABS[number]

export default function ComercialPage() {
  const qc = useQueryClient()
  const { toast } = useToast()
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

  const createStage = useMutation({
    mutationFn: (name: string) => api.post('/comercial/stages', { name, color: STAGE_COLORS[stages.length % STAGE_COLORS.length] }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['stages'] }); setNewStageName(''); setShowStageForm(false) },
  })

  const deleteLead = useMutation({
    mutationFn: (id: string) => api.delete(`/comercial/leads/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['leads'] }); qc.invalidateQueries({ queryKey: ['comercial-stats'] }) },
  })

  const moveLead = useMutation({
    mutationFn: ({ id, stageId }: { id: string; stageId: string | null }) => api.patch(`/comercial/leads/${id}`, { stageId }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['leads'] }),
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

  function exportCSV() {
    const rows = [['Nome', 'Telefone', 'E-mail', 'Origem', 'Valor', 'Etapa', 'Criado em']]
    leads.forEach((l: Lead) => rows.push([l.name, l.phone ?? '', l.email ?? '', l.source ?? '', l.value?.toString() ?? '', l.stage?.name ?? '', new Date(l.createdAt).toLocaleDateString('pt-BR')]))
    const csv = rows.map(r => r.map(c => `"${c.replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = 'leads.csv'; a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Comercial</h1>
          <p className="text-gray-500 text-sm mt-1">Pipeline de vendas e acompanhamento de leads</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="flex items-center gap-2" onClick={exportCSV}>
            <Download className="w-4 h-4" />
            Exportar CSV
          </Button>
          <Button onClick={() => { setShowFollowUpModal(true); setFollowUpLeadId(undefined) }} variant="outline" className="flex items-center gap-2">
            <Calendar className="w-4 h-4" />
            Follow-up
          </Button>
          <Button onClick={() => { setEditingLead(null); setShowLeadModal(true) }} className="bg-[#1565C0] hover:bg-[#1565C0]/90 text-white flex items-center gap-2">
            <Plus className="w-4 h-4" />
            Novo lead
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="flex items-center gap-2 text-gray-500 text-sm mb-1"><Users className="w-4 h-4" />Total de leads</div>
          <div className="text-2xl font-bold text-gray-900">{leads.length}</div>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="flex items-center gap-2 text-gray-500 text-sm mb-1"><TrendingUp className="w-4 h-4" />Etapas ativas</div>
          <div className="text-2xl font-bold text-gray-900">{stages.length}</div>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="flex items-center gap-2 text-gray-500 text-sm mb-1"><Clock className="w-4 h-4" />Follow-ups pendentes</div>
          <div className="text-2xl font-bold text-gray-900">{pendingFollowUps.length}</div>
        </div>
        <div className={cn('rounded-lg border p-4', overdueFollowUps.length > 0 ? 'bg-red-50 border-red-200' : 'bg-white border-gray-200')}>
          <div className="flex items-center gap-2 text-gray-500 text-sm mb-1"><AlertTriangle className="w-4 h-4 text-red-400" />Atrasados</div>
          <div className={cn('text-2xl font-bold', overdueFollowUps.length > 0 ? 'text-red-600' : 'text-gray-900')}>{overdueFollowUps.length}</div>
        </div>
      </div>

      <div className="border-b border-gray-200">
        <div className="flex gap-6">
          {TABS.map(t => (
            <button key={t} onClick={() => setActiveTab(t)}
              className={cn('pb-3 text-sm font-medium border-b-2 transition-colors', activeTab === t ? 'border-[#1565C0] text-[#1565C0]' : 'border-transparent text-gray-500 hover:text-gray-700')}>
              {t}
              {t === 'Follow-ups' && overdueFollowUps.length > 0 && (
                <span className="ml-2 bg-red-500 text-white text-xs rounded-full px-1.5 py-0.5">{overdueFollowUps.length}</span>
              )}
            </button>
          ))}
        </div>
      </div>

      {activeTab === 'Pipeline' && (
        <div className="overflow-x-auto pb-4">
          <div className="flex gap-4 min-w-max">
            {unstagedLeads.length > 0 && (
              <div className="w-72 shrink-0">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-gray-300" />
                    <span className="font-semibold text-gray-700 text-sm">Sem etapa</span>
                    <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">{unstagedLeads.length}</span>
                  </div>
                </div>
                <div className="space-y-2">
                  {unstagedLeads.map(lead => (
                    <LeadCard key={lead.id} lead={lead}
                      onEdit={() => { setEditingLead(lead); setShowLeadModal(true) }}
                      onDelete={() => { if (confirm(`Remover ${lead.name}?`)) deleteLead.mutate(lead.id) }}
                      onFollowUp={() => { setFollowUpLeadId(lead.id); setShowFollowUpModal(true) }}
                    />
                  ))}
                </div>
              </div>
            )}

            {stages.map(stage => {
              const stageLeads = leads.filter(l => l.stageId === stage.id)
              return (
                <div key={stage.id} className="w-72 shrink-0">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full" style={{ background: stage.color }} />
                      <span className="font-semibold text-gray-700 text-sm">{stage.name}</span>
                      <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">{stageLeads.length}</span>
                    </div>
                  </div>
                  <div className="space-y-2 min-h-[100px] bg-gray-50 rounded-lg p-2"
                    onDragOver={e => e.preventDefault()}
                    onDrop={e => {
                      e.preventDefault()
                      const leadId = e.dataTransfer.getData('leadId')
                      if (leadId) moveLead.mutate({ id: leadId, stageId: stage.id })
                    }}>
                    {stageLeads.map(lead => (
                      <div key={lead.id} draggable onDragStart={e => e.dataTransfer.setData('leadId', lead.id)}>
                        <LeadCard lead={lead}
                          onEdit={() => { setEditingLead(lead); setShowLeadModal(true) }}
                          onDelete={() => { if (confirm(`Remover ${lead.name}?`)) deleteLead.mutate(lead.id) }}
                          onFollowUp={() => { setFollowUpLeadId(lead.id); setShowFollowUpModal(true) }}
                        />
                      </div>
                    ))}
                    {stageLeads.length === 0 && (
                      <div className="text-xs text-gray-400 text-center py-6">Arraste leads aqui</div>
                    )}
                  </div>
                </div>
              )
            })}

            <div className="w-72 shrink-0">
              {showStageForm ? (
                <div className="bg-white rounded-lg border border-gray-200 p-3">
                  <Input placeholder="Nome da etapa" value={newStageName} onChange={e => setNewStageName(e.target.value)} autoFocus onKeyDown={e => { if (e.key === 'Enter') createStage.mutate(newStageName) }} />
                  <div className="flex gap-2 mt-2">
                    <Button size="sm" onClick={() => createStage.mutate(newStageName)} disabled={!newStageName.trim() || createStage.isPending} className="bg-[#1565C0] text-white">Criar</Button>
                    <Button size="sm" variant="outline" onClick={() => setShowStageForm(false)}>Cancelar</Button>
                  </div>
                </div>
              ) : (
                <button onClick={() => setShowStageForm(true)} className="w-full h-12 rounded-lg border-2 border-dashed border-gray-300 text-gray-400 hover:border-[#1565C0] hover:text-[#1565C0] transition-colors flex items-center justify-center gap-2 text-sm">
                  <Plus className="w-4 h-4" /> Nova etapa
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'Follow-ups' && (
        <div className="space-y-3">
          {loadingFollowUps ? (
            <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-[#1565C0]" /></div>
          ) : pendingFollowUps.length === 0 ? (
            <div className="text-center py-16 text-gray-400">
              <Calendar className="w-10 h-10 mx-auto mb-3 opacity-40" />
              <p>Nenhum follow-up pendente</p>
              <Button onClick={() => { setShowFollowUpModal(true); setFollowUpLeadId(undefined) }} className="mt-4 bg-[#1565C0] text-white">Agendar primeiro follow-up</Button>
            </div>
          ) : (
            pendingFollowUps.map(fu => {
              const overdue = new Date(fu.scheduledAt) < new Date()
              return (
                <div key={fu.id} className={cn('bg-white rounded-lg border p-4 flex items-start justify-between gap-4', overdue ? 'border-red-200 bg-red-50' : 'border-gray-200')}>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      {overdue && <AlertTriangle className="w-4 h-4 text-red-500 shrink-0" />}
                      <span className="font-medium text-gray-900">{fu.title}</span>
                    </div>
                    {fu.lead && <div className="text-sm text-gray-500 mt-0.5">Lead: {fu.lead.name}</div>}
                    {fu.notes && <div className="text-sm text-gray-400 mt-1">{fu.notes}</div>}
                    <div className={cn('text-xs mt-1 font-medium', overdue ? 'text-red-600' : 'text-[#1565C0]')}>
                      {new Date(fu.scheduledAt).toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                      {overdue && ' — ATRASADO'}
                    </div>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <Button size="sm" onClick={() => markFollowUpDone.mutate(fu.id)} disabled={markFollowUpDone.isPending} variant="outline" className="text-green-600 border-green-300 hover:bg-green-50">Concluído</Button>
                    <button onClick={() => deleteFollowUp.mutate(fu.id)} className="p-2 hover:bg-red-50 rounded text-gray-400 hover:text-red-500"><X className="w-4 h-4" /></button>
                  </div>
                </div>
              )
            })
          )}
        </div>
      )}

      <LeadModal open={showLeadModal} onClose={() => { setShowLeadModal(false); setEditingLead(null) }} stages={stages} lead={editingLead} />
      <FollowUpModal open={showFollowUpModal} onClose={() => setShowFollowUpModal(false)} leads={leads} leadId={followUpLeadId} />
    </div>
  )
}
