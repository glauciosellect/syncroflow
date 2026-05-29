'use client'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '@/lib/api'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Users, Loader2 } from 'lucide-react'

const roleLabels: Record<string, string> = { OWNER: 'Proprietário', ADMIN: 'Administrador', AGENT: 'Agente' }
const roleColors: Record<string, string> = { OWNER: 'bg-violet-100 text-violet-700', ADMIN: 'bg-blue-100 text-blue-700', AGENT: 'bg-gray-100 text-gray-700' }

export default function TeamPage() {
  const qc = useQueryClient()
  const { data: members, isLoading } = useQuery({
    queryKey: ['members'],
    queryFn: () => api.get('/workspaces/me/members').then(r => r.data),
  })

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Equipe</h1>
        <p className="text-gray-500 text-sm mt-1">Gerencie os membros do seu workspace</p>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-violet-600" /></div>
      ) : (
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <div className="p-4 border-b border-gray-100 flex items-center justify-between">
            <h3 className="font-semibold text-gray-900">Membros ({members?.length || 0})</h3>
          </div>
          <div className="divide-y divide-gray-100">
            {(members || []).map((member: any) => (
              <div key={member.id} className="flex items-center justify-between px-4 py-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-violet-100 rounded-full flex items-center justify-center text-sm font-bold text-violet-600">
                    {member.user?.name?.[0]?.toUpperCase()}
                  </div>
                  <div>
                    <div className="font-medium text-gray-900">{member.user?.name}</div>
                    <div className="text-sm text-gray-400">{member.user?.email}</div>
                  </div>
                </div>
                <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${roleColors[member.role]}`}>
                  {roleLabels[member.role]}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
