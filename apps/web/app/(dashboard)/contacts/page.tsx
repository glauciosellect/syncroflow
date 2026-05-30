'use client'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import api from '@/lib/api'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { Search, Users, Phone, Mail } from 'lucide-react'
import { formatDate, channelLabel } from '@/lib/utils'
import { Loader2 } from 'lucide-react'

export default function ContactsPage() {
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)

  const { data, isLoading } = useQuery({
    queryKey: ['contacts', search, page],
    queryFn: () => api.get('/contacts', { params: { search: search || undefined, page, limit: 20 } }).then(r => r.data),
  })

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Contatos</h1>
        <p className="text-gray-500 text-sm mt-1">Todos os contatos que interagiram com seus agentes</p>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <Input placeholder="Buscar por nome, telefone ou email..." className="pl-10" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1) }} />
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-[#1565C0]" /></div>
      ) : data?.data?.length === 0 ? (
        <div className="text-center py-16">
          <Users className="w-16 h-16 text-gray-200 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-gray-700 mb-2">Nenhum contato ainda</h3>
          <p className="text-gray-400">Os contatos aparecerão aqui quando alguém interagir com seus agentes</p>
        </div>
      ) : (
        <>
          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-4 py-3">Contato</th>
                  <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-4 py-3">Telefone</th>
                  <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-4 py-3">Email</th>
                  <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-4 py-3">Tags</th>
                  <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-4 py-3">Criado em</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {(data?.data || []).map((contact: any) => (
                  <tr key={contact.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center text-xs font-bold text-[#1565C0]">
                          {contact.name?.[0]?.toUpperCase() || '?'}
                        </div>
                        <div>
                          <div className="text-sm font-medium text-gray-900">{contact.name || 'Sem nome'}</div>
                          <div className="text-xs text-gray-400">{contact.externalId}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1 text-sm text-gray-600">
                        {contact.phone && <><Phone className="w-3 h-3 text-gray-400" />{contact.phone}</>}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1 text-sm text-gray-600">
                        {contact.email && <><Mail className="w-3 h-3 text-gray-400" />{contact.email}</>}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {(contact.tags || []).map((tag: string) => (
                          <span key={tag} className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{tag}</span>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500">{formatDate(contact.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between text-sm text-gray-500">
            <span>Mostrando {((page - 1) * 20) + 1}–{Math.min(page * 20, data?.total || 0)} de {data?.total} contatos</span>
            <div className="flex gap-2">
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="px-3 py-1 border rounded-md disabled:opacity-50 hover:bg-gray-50">Anterior</button>
              <button onClick={() => setPage(p => p + 1)} disabled={page * 20 >= (data?.total || 0)} className="px-3 py-1 border rounded-md disabled:opacity-50 hover:bg-gray-50">Próximo</button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

