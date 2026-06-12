'use client'
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '@/lib/api'
import { Loader2, UserPlus, Mail, X, Clock, RefreshCw, Shield, ScrollText, ChevronDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useToast } from '@/components/ui/use-toast'
import { cn } from '@/lib/utils'

// ─── Roles ───────────────────────────────────────────────────────────────────

const ROLES = [
  { value: 'ADMIN',  label: 'Administrador', desc: 'Gerencia workspace, agentes e membros',        color: 'bg-blue-100 text-blue-700' },
  { value: 'MEMBER', label: 'Membro',         desc: 'Cria e edita agentes, gerencia conversas',    color: 'bg-indigo-100 text-indigo-700' },
  { value: 'AGENT',  label: 'Agente',         desc: 'Visualiza e gerencia conversas atribuídas',   color: 'bg-gray-100 text-gray-700' },
  { value: 'VIEWER', label: 'Visualizador',   desc: 'Apenas leitura — visualiza dados e analytics', color: 'bg-yellow-100 text-yellow-700' },
]

const ROLE_OWNER = { value: 'OWNER', label: 'Proprietário', desc: 'Acesso total irrestrito', color: 'bg-purple-100 text-purple-700' }

const ALL_ROLES: Record<string, { label: string; color: string }> = {
  OWNER:  { label: 'Proprietário',  color: 'bg-purple-100 text-purple-700' },
  ADMIN:  { label: 'Administrador', color: 'bg-blue-100 text-blue-700' },
  MEMBER: { label: 'Membro',        color: 'bg-indigo-100 text-indigo-700' },
  AGENT:  { label: 'Agente',        color: 'bg-gray-100 text-gray-700' },
  VIEWER: { label: 'Visualizador',  color: 'bg-yellow-100 text-yellow-700' },
}

const TABS = [
  { id: 'members',  label: 'Membros',     icon: Shield },
  { id: 'audit',    label: 'Auditoria',   icon: ScrollText },
]

// ─── Modal de convite ─────────────────────────────────────────────────────────

function InviteModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient()
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<string>('AGENT')
  const [error, setError] = useState('')

  const invite = useMutation({
    mutationFn: (data: { email: string; role: string }) => api.post('/workspaces/me/members/invite', data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['invites'] })
      setEmail(''); setRole('AGENT'); setError(''); onClose()
    },
    onError: (err: any) => setError(err.response?.data?.error || 'Erro ao enviar convite'),
  })

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose() }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Convidar membro</DialogTitle>
        </DialogHeader>
        <form onSubmit={e => { e.preventDefault(); if (!email) return setError('Informe o e-mail'); invite.mutate({ email, role }) }}
          className="space-y-4 mt-2">
          <div>
            <label className="block text-sm font-medium mb-1">E-mail</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)}
              placeholder="nome@empresa.com"
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1565C0]" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Papel</label>
            <Select value={role} onValueChange={setRole}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ROLES.map(r => (
                  <SelectItem key={r.value} value={r.value}>
                    <div>
                      <span className="font-medium">{r.label}</span>
                      <span className="text-xs text-muted-foreground ml-2">— {r.desc}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Explicação dos roles */}
            <div className="mt-3 space-y-1.5">
              {[...ROLES, ROLE_OWNER].map(r => (
                <div key={r.value} className="flex items-start gap-2">
                  <span className={cn('text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0 mt-0.5', r.color)}>{r.label}</span>
                  <span className="text-xs text-muted-foreground">{r.desc}</span>
                </div>
              ))}
            </div>
          </div>
          {error && <p className="text-sm text-red-500">{error}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
            <Button type="submit" disabled={invite.isPending} className="bg-[#1565C0] hover:bg-[#0D47A1] text-white">
              {invite.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Enviar convite
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ─── Página principal ─────────────────────────────────────────────────────────

export default function TeamPage() {
  const qc = useQueryClient()
  const { toast } = useToast()
  const [showInvite, setShowInvite] = useState(false)
  const [activeTab, setActiveTab] = useState('members')
  const [changingRole, setChangingRole] = useState<string | null>(null)

  const { data: members = [], isLoading: loadingMembers } = useQuery<any[]>({
    queryKey: ['members'],
    queryFn: () => api.get('/workspaces/me/members').then(r => r.data),
  })

  const { data: invites = [], isLoading: loadingInvites } = useQuery<any[]>({
    queryKey: ['invites'],
    queryFn: () => api.get('/workspaces/me/invites').then(r => r.data),
  })

  const { data: auditData, isLoading: loadingAudit } = useQuery<any>({
    queryKey: ['audit-log'],
    queryFn: () => api.get('/workspace/audit-log?limit=50').then(r => r.data),
    enabled: activeTab === 'audit',
  })

  const removeMember = useMutation({
    mutationFn: (id: string) => api.delete(`/workspaces/me/members/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['members'] }); toast({ title: 'Membro removido' }) },
  })

  const changeRole = useMutation({
    mutationFn: ({ memberId, role }: { memberId: string; role: string }) =>
      api.patch(`/workspace/members/${memberId}/role`, { role }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['members'] })
      setChangingRole(null)
      toast({ title: '✅ Papel atualizado!' })
    },
    onError: (err: any) => toast({ title: err?.response?.data?.error ?? 'Erro ao atualizar papel', variant: 'destructive' }),
  })

  const cancelInvite = useMutation({
    mutationFn: (id: string) => api.delete(`/workspaces/me/invites/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['invites'] }),
  })

  const resendInvite = useMutation({
    mutationFn: ({ email, role }: { email: string; role: string }) =>
      api.post('/workspaces/me/members/invite', { email, role }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['invites'] }); toast({ title: 'Convite reenviado' }) },
  })

  const auditLogs: any[] = auditData?.logs ?? []

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Equipe</h1>
          <p className="text-muted-foreground text-sm mt-1">Gerencie membros, papéis e permissões do workspace</p>
        </div>
        <Button onClick={() => setShowInvite(true)} className="bg-[#1565C0] hover:bg-[#0D47A1] text-white gap-2">
          <UserPlus className="w-4 h-4" /> Convidar membro
        </Button>
      </div>

      {/* Abas */}
      <div className="flex gap-1 p-1 bg-muted rounded-xl w-fit">
        {TABS.map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)}
            className={cn('flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg transition-all',
              activeTab === tab.id ? 'bg-background shadow text-foreground' : 'text-muted-foreground hover:text-foreground'
            )}>
            <tab.icon className="w-3.5 h-3.5" /> {tab.label}
          </button>
        ))}
      </div>

      {/* ── ABA MEMBROS ─────────────────────────────────────────────────────── */}
      {activeTab === 'members' && (
        <div className="space-y-4">
          {loadingMembers || loadingInvites ? (
            <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
          ) : (
            <>
              {/* Membros ativos */}
              <div className="bg-card border rounded-2xl overflow-hidden">
                <div className="p-4 border-b">
                  <h3 className="font-semibold">Membros ativos ({members.length})</h3>
                </div>
                <div className="divide-y">
                  {members.map((member: any) => {
                    const role = ALL_ROLES[member.role] ?? { label: member.role, color: 'bg-gray-100 text-gray-700' }
                    const isOwner = member.role === 'OWNER'
                    const isChanging = changingRole === member.id

                    return (
                      <div key={member.id} className="flex items-center justify-between px-4 py-3 gap-4">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold text-white shrink-0"
                            style={{ background: 'linear-gradient(135deg, #1565C0 0%, #3DBE29 100%)' }}>
                            {member.user?.name?.[0]?.toUpperCase() ?? '?'}
                          </div>
                          <div className="min-w-0">
                            <p className="font-medium text-sm truncate">{member.user?.name}</p>
                            <p className="text-xs text-muted-foreground truncate">{member.user?.email}</p>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          {isOwner ? (
                            <span className={cn('text-xs font-semibold px-2.5 py-1 rounded-full', role.color)}>
                              {role.label}
                            </span>
                          ) : isChanging ? (
                            <div className="flex items-center gap-2">
                              <Select defaultValue={member.role}
                                onValueChange={val => changeRole.mutate({ memberId: member.id, role: val })}>
                                <SelectTrigger className="h-8 text-xs w-40">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {ROLES.map(r => (
                                    <SelectItem key={r.value} value={r.value} className="text-xs">{r.label}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              <button onClick={() => setChangingRole(null)}
                                className="text-muted-foreground hover:text-foreground">
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => setChangingRole(member.id)}
                              className={cn('flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full hover:opacity-80 transition-opacity', role.color)}>
                              {role.label} <ChevronDown className="w-3 h-3" />
                            </button>
                          )}

                          {!isOwner && (
                            <button
                              onClick={() => { if (confirm(`Remover ${member.user?.name}?`)) removeMember.mutate(member.id) }}
                              className="text-muted-foreground hover:text-red-500 transition-colors" title="Remover">
                              <X className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Referência de permissões */}
              <div className="bg-card border rounded-2xl p-4 space-y-3">
                <h3 className="font-semibold text-sm">Referência de papéis</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {[ROLE_OWNER, ...ROLES].map(r => (
                    <div key={r.value} className="flex items-start gap-2.5 p-3 rounded-xl bg-muted/50">
                      <span className={cn('text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0 mt-0.5', r.color)}>{r.label}</span>
                      <span className="text-xs text-muted-foreground">{r.desc}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Convites pendentes */}
              {invites.length > 0 && (
                <div className="bg-card border rounded-2xl overflow-hidden">
                  <div className="p-4 border-b">
                    <h3 className="font-semibold flex items-center gap-2">
                      <Clock className="w-4 h-4 text-amber-500" /> Convites pendentes ({invites.length})
                    </h3>
                  </div>
                  <div className="divide-y">
                    {invites.map((invite: any) => {
                      const role = ALL_ROLES[invite.role] ?? { label: invite.role, color: 'bg-gray-100 text-gray-700' }
                      return (
                        <div key={invite.id} className="flex items-center justify-between px-4 py-3">
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 bg-amber-50 rounded-full flex items-center justify-center shrink-0">
                              <Mail className="w-4 h-4 text-amber-500" />
                            </div>
                            <div>
                              <p className="font-medium text-sm">{invite.email}</p>
                              <p className="text-xs text-muted-foreground">Aguardando resposta</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className={cn('text-xs font-semibold px-2.5 py-1 rounded-full', role.color)}>{role.label}</span>
                            <button onClick={() => resendInvite.mutate({ email: invite.email, role: invite.role })}
                              disabled={resendInvite.isPending}
                              className="text-muted-foreground hover:text-[#1565C0] transition-colors" title="Reenviar">
                              <RefreshCw className="w-4 h-4" />
                            </button>
                            <button onClick={() => cancelInvite.mutate(invite.id)}
                              disabled={cancelInvite.isPending}
                              className="text-muted-foreground hover:text-red-500 transition-colors" title="Cancelar">
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ── ABA AUDITORIA ────────────────────────────────────────────────────── */}
      {activeTab === 'audit' && (
        <div className="bg-card border rounded-2xl overflow-hidden">
          <div className="p-4 border-b">
            <h3 className="font-semibold">Log de auditoria</h3>
            <p className="text-xs text-muted-foreground mt-0.5">Últimas 50 ações sensíveis no workspace</p>
          </div>
          {loadingAudit ? (
            <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
          ) : auditLogs.length === 0 ? (
            <div className="text-center py-12 text-sm text-muted-foreground">Nenhuma ação registrada ainda.</div>
          ) : (
            <div className="divide-y">
              {auditLogs.map((log: any) => (
                <div key={log.id} className="flex items-start gap-3 px-4 py-3">
                  <div className="w-2 h-2 rounded-full bg-[#1565C0] mt-1.5 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">{formatAction(log.action)}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      {log.resourceType && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-medium uppercase">
                          {log.resourceType}
                        </span>
                      )}
                      {log.userId && (
                        <span className="text-xs text-muted-foreground truncate">por {log.userId.slice(0, 8)}...</span>
                      )}
                    </div>
                  </div>
                  <span className="text-xs text-muted-foreground shrink-0">
                    {new Date(log.createdAt).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <InviteModal open={showInvite} onClose={() => setShowInvite(false)} />
    </div>
  )
}

function formatAction(action: string): string {
  const map: Record<string, string> = {
    'member.role_changed': 'Papel de membro alterado',
    'member.removed': 'Membro removido do workspace',
    'member.invited': 'Membro convidado',
    'agent.created': 'Agente criado',
    'agent.deleted': 'Agente removido',
    'integration.connected': 'Integração conectada',
    'integration.disconnected': 'Integração desconectada',
    'billing.plan_changed': 'Plano alterado',
  }
  return map[action] ?? action
}
