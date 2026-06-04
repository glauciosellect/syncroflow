'use client'
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '@/lib/api'
import { Loader2, UserPlus, Mail, X, Clock, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

const roleLabels: Record<string, string> = {
  OWNER: 'Proprietário',
  ADMIN: 'Administrador',
  AGENT: 'Agente',
}
const roleColors: Record<string, string> = {
  OWNER: 'bg-blue-100 text-[#1565C0]',
  ADMIN: 'bg-blue-100 text-blue-700',
  AGENT: 'bg-gray-100 text-gray-700',
}

function InviteModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient()
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<'ADMIN' | 'AGENT'>('AGENT')
  const [error, setError] = useState('')

  const invite = useMutation({
    mutationFn: (data: { email: string; role: string }) => api.post('/workspaces/me/members/invite', data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['invites'] })
      setEmail('')
      setRole('AGENT')
      setError('')
      onClose()
    },
    onError: (err: any) => setError(err.response?.data?.error || 'Erro ao enviar convite'),
  })

  function submit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (!email) return setError('Informe o e-mail')
    invite.mutate({ email, role })
  }

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose() }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Convidar membro</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4 mt-2">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">E-mail</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="nome@empresa.com"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1565C0]"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Papel</label>
            <Select value={role} onValueChange={v => setRole(v as any)}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="AGENT">Agente — atende conversas transferidas</SelectItem>
                <SelectItem value="ADMIN">Administrador — gerencia workspace</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {error && <p className="text-sm text-red-500">{error}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
            <Button type="submit" disabled={invite.isPending} className="bg-[#1565C0] hover:bg-[#1565C0]/90 text-white">
              {invite.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Enviar convite
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export default function TeamPage() {
  const qc = useQueryClient()
  const [showInvite, setShowInvite] = useState(false)

  const { data: members, isLoading: loadingMembers } = useQuery({
    queryKey: ['members'],
    queryFn: () => api.get('/workspaces/me/members').then(r => r.data),
  })

  const { data: invites, isLoading: loadingInvites } = useQuery({
    queryKey: ['invites'],
    queryFn: () => api.get('/workspaces/me/invites').then(r => r.data),
  })

  const removeMember = useMutation({
    mutationFn: (id: string) => api.delete(`/workspaces/me/members/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['members'] }),
  })

  const cancelInvite = useMutation({
    mutationFn: (id: string) => api.delete(`/workspaces/me/invites/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['invites'] }),
  })

  const resendInvite = useMutation({
    mutationFn: ({ email, role }: { email: string; role: string }) =>
      api.post('/workspaces/me/members/invite', { email, role }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['invites'] }),
  })

  const isLoading = loadingMembers || loadingInvites
  const pendingInvites = (invites || []) as any[]

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Equipe</h1>
          <p className="text-gray-500 text-sm mt-1">Gerencie os membros do seu workspace</p>
        </div>
        <Button
          onClick={() => setShowInvite(true)}
          className="bg-[#1565C0] hover:bg-[#1565C0]/90 text-white flex items-center gap-2"
        >
          <UserPlus className="w-4 h-4" />
          Convidar membro
        </Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-[#1565C0]" />
        </div>
      ) : (
        <div className="space-y-4">
          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
            <div className="p-4 border-b border-gray-100">
              <h3 className="font-semibold text-gray-900">Membros ({members?.length || 0})</h3>
            </div>
            <div className="divide-y divide-gray-100">
              {(members || []).map((member: any) => (
                <div key={member.id} className="flex items-center justify-between px-4 py-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center text-sm font-bold text-[#1565C0]">
                      {member.user?.name?.[0]?.toUpperCase()}
                    </div>
                    <div>
                      <div className="font-medium text-gray-900">{member.user?.name}</div>
                      <div className="text-sm text-gray-400">{member.user?.email}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${roleColors[member.role]}`}>
                      {roleLabels[member.role]}
                    </span>
                    {member.role !== 'OWNER' && (
                      <button
                        onClick={() => {
                          if (confirm(`Remover ${member.user?.name} do workspace?`)) {
                            removeMember.mutate(member.id)
                          }
                        }}
                        className="text-gray-400 hover:text-red-500 transition-colors"
                        title="Remover membro"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {pendingInvites.length > 0 && (
            <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
              <div className="p-4 border-b border-gray-100">
                <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                  <Clock className="w-4 h-4 text-amber-500" />
                  Convites pendentes ({pendingInvites.length})
                </h3>
              </div>
              <div className="divide-y divide-gray-100">
                {pendingInvites.map((invite: any) => (
                  <div key={invite.id} className="flex items-center justify-between px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-amber-50 rounded-full flex items-center justify-center">
                        <Mail className="w-4 h-4 text-amber-500" />
                      </div>
                      <div>
                        <div className="font-medium text-gray-900">{invite.email}</div>
                        <div className="text-sm text-gray-400">Aguardando resposta</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${roleColors[invite.role]}`}>
                        {roleLabels[invite.role]}
                      </span>
                      <button
                        onClick={() => resendInvite.mutate({ email: invite.email, role: invite.role })}
                        disabled={resendInvite.isPending}
                        className="text-gray-400 hover:text-[#1565C0] transition-colors"
                        title="Reenviar convite"
                      >
                        <RefreshCw className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => cancelInvite.mutate(invite.id)}
                        disabled={cancelInvite.isPending}
                        className="text-gray-400 hover:text-red-500 transition-colors"
                        title="Cancelar convite"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <InviteModal open={showInvite} onClose={() => setShowInvite(false)} />
    </div>
  )
}
