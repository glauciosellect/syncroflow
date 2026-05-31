'use client'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import api from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Plus, Trash2, QrCode, Loader2, Save, Plug } from 'lucide-react'
import { useToast } from '@/components/ui/use-toast'
import { channelLabel } from '@/lib/utils'
import { cn } from '@/lib/utils'

const channelIcons: Record<string, string> = {
  WHATSAPP: '📱', INSTAGRAM: '📸', FACEBOOK: '📘', TELEGRAM: '✈️', WIDGET: '💬', EMAIL: '📧', SMS: '📩',
}

const externalApis = [
  { key: 'google_calendar', label: 'Google Calendar', desc: 'Agendamentos e convites automáticos', icon: '📅', color: 'bg-blue-50 border-blue-200', tag: 'Em breve' },
  { key: 'elevenlabs', label: 'ElevenLabs', desc: 'Respostas em voz humanizada', icon: '🎙️', color: 'bg-purple-50 border-purple-200', tag: 'Em breve' },
  { key: 'shopify', label: 'Shopify', desc: 'Catálogo de produtos e pedidos', icon: '🛍️', color: 'bg-green-50 border-green-200', tag: 'Em breve' },
  { key: 'stripe', label: 'Stripe', desc: 'Links de pagamento e cobranças', icon: '💳', color: 'bg-indigo-50 border-indigo-200', tag: 'Em breve' },
  { key: 'n8n', label: 'n8n / Zapier', desc: 'Automações via webhook externo', icon: '⚡', color: 'bg-orange-50 border-orange-200', tag: 'Via intenção' },
  { key: 'notion', label: 'Notion', desc: 'Bases de conhecimento externas', icon: '📒', color: 'bg-gray-50 border-gray-200', tag: 'Em breve' },
]

const channelForms: Record<string, { label: string; fields: { key: string; label: string; placeholder?: string }[] }> = {
  whatsapp: { label: 'WhatsApp', fields: [{ key: 'name', label: 'Nome da conexão', placeholder: 'Ex: WhatsApp Principal' }] },
  telegram: { label: 'Telegram', fields: [{ key: 'name', label: 'Nome', placeholder: 'Ex: Bot de Suporte' }, { key: 'botToken', label: 'Bot Token', placeholder: 'Obtido no @BotFather' }] },
  instagram: { label: 'Instagram', fields: [{ key: 'name', label: 'Nome', placeholder: 'Ex: Instagram da Loja' }, { key: 'pageAccessToken', label: 'Page Access Token' }, { key: 'pageId', label: 'Page ID' }] },
  widget: { label: 'Widget para Sites', fields: [{ key: 'name', label: 'Nome', placeholder: 'Ex: Widget do Site' }, { key: 'welcomeMessage', label: 'Mensagem de boas-vindas', placeholder: 'Olá! Como posso ajudar?' }] },
}

const sections = [
  { key: 'channels', label: 'Canais de Mensagem' },
  { key: 'apis', label: 'APIs & Plataformas' },
]

export default function IntegrationsPage() {
  const { toast } = useToast()
  const qc = useQueryClient()
  const [activeSection, setActiveSection] = useState('channels')
  const [showForm, setShowForm] = useState<string | null>(null)
  const [formData, setFormData] = useState<any>({})
  const [qrData, setQrData] = useState<Record<string, { qr: string; status: string }>>({})
  const [selectedAgents, setSelectedAgents] = useState<Record<string, string>>({})

  const { data: channels, isLoading } = useQuery({
    queryKey: ['channels'],
    queryFn: () => api.get('/channels').then(r => r.data),
  })

  const { data: agents } = useQuery({
    queryKey: ['agents'],
    queryFn: () => api.get('/agents').then(r => r.data),
  })

  const assignAgentMutation = useMutation({
    mutationFn: ({ channelId, agentId }: { channelId: string; agentId: string }) =>
      api.patch(`/channels/${channelId}/agents`, { agentIds: agentId ? [agentId] : [] }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['channels'] }); toast({ title: 'Agente vinculado!' }) },
    onError: () => toast({ title: 'Erro ao vincular agente', variant: 'destructive' }),
  })

  const createMutation = useMutation({
    mutationFn: (data: any) => api.post(`/channels/${showForm}`, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['channels'] }); setShowForm(null); setFormData({}) },
    onError: (err: any) => toast({ title: 'Erro', description: err.response?.data?.error || 'Erro ao conectar canal', variant: 'destructive' }),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/channels/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['channels'] }); toast({ title: 'Canal desconectado' }) },
  })

  const loadQR = async (channelId: string) => {
    try {
      const res = await api.get(`/channels/${channelId}/qr`)
      setQrData(p => ({ ...p, [channelId]: { qr: res.data.qr, status: res.data.status } }))
    } catch {
      toast({ title: 'Erro ao carregar QR Code', variant: 'destructive' })
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Integrações</h1>
          <p className="text-gray-500 text-sm mt-1">Conecte canais de mensagem e plataformas externas</p>
        </div>
        {activeSection === 'channels' && (
          <div className="flex gap-2">
            {Object.entries(channelForms).map(([key, form]) => (
              <Button key={key} variant="outline" size="sm" onClick={() => setShowForm(key)}>
                <Plus className="w-3 h-3 mr-1" />{form.label}
              </Button>
            ))}
          </div>
        )}
      </div>

      {/* Sub-abas */}
      <div className="flex gap-1 border-b border-gray-200">
        {sections.map(s => (
          <button key={s.key} onClick={() => setActiveSection(s.key)}
            className={cn('px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px',
              activeSection === s.key ? 'border-[#1565C0] text-[#1565C0]' : 'border-transparent text-gray-500 hover:text-gray-700')}>
            {s.label}
          </button>
        ))}
      </div>

      {/* CANAIS DE MENSAGEM */}
      {activeSection === 'channels' && (
        <>
          {showForm && channelForms[showForm] && (
            <Card>
              <CardHeader><CardTitle className="text-base">Conectar {channelForms[showForm].label}</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                {channelForms[showForm].fields.map((field) => (
                  <div key={field.key}>
                    <Label>{field.label}</Label>
                    <Input placeholder={field.placeholder} value={formData[field.key] || ''} onChange={e => setFormData((p: any) => ({ ...p, [field.key]: e.target.value }))} className="mt-1" />
                  </div>
                ))}
                <div className="flex gap-2">
                  <Button onClick={() => createMutation.mutate(formData)} className="bg-[#1565C0] hover:bg-[#0D47A1]" disabled={createMutation.isPending}>
                    {createMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                    Conectar
                  </Button>
                  <Button variant="ghost" onClick={() => { setShowForm(null); setFormData({}) }}>Cancelar</Button>
                </div>
              </CardContent>
            </Card>
          )}

          {isLoading ? (
            <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-[#1565C0]" /></div>
          ) : channels?.length === 0 ? (
            <div className="text-center py-16">
              <Plug className="w-16 h-16 text-gray-200 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-gray-700 mb-2">Nenhum canal conectado</h3>
              <p className="text-gray-400">Use os botões acima para conectar seu primeiro canal</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {(channels || []).map((channel: any) => (
                <Card key={channel.id}>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <span className="text-2xl">{channelIcons[channel.type] || '📡'}</span>
                        <div>
                          <div className="font-semibold text-gray-900">{channel.name}</div>
                          <Badge variant={channel.isActive ? 'success' : 'secondary'} className="text-xs mt-0.5">
                            {channel.isActive ? 'Ativo' : 'Inativo'}
                          </Badge>
                        </div>
                      </div>
                      <span className="text-xs bg-gray-100 text-gray-500 px-2 py-1 rounded-full">{channelLabel(channel.type)}</span>
                    </div>

                    {channel.type === 'WHATSAPP' && (
                      <div className="mt-3">
                        {qrData[channel.id] ? (
                          qrData[channel.id].status === 'connected' ? (
                            <div className="text-center text-sm text-green-600 font-medium py-2">✓ WhatsApp conectado</div>
                          ) : qrData[channel.id].qr ? (
                            <img src={qrData[channel.id].qr} alt="QR Code" className="w-40 h-40 mx-auto rounded-lg" />
                          ) : (
                            <div className="text-center text-sm text-gray-500 py-2">Aguardando QR Code...</div>
                          )
                        ) : (
                          <Button variant="outline" size="sm" onClick={() => loadQR(channel.id)} className="w-full">
                            <QrCode className="w-3 h-3 mr-2" />Ver QR Code
                          </Button>
                        )}
                      </div>
                    )}

                    <div className="mt-3 pt-3 border-t border-gray-100 space-y-2">
                      <div>
                        <Label className="text-xs text-gray-500">Agente vinculado</Label>
                        <div className="flex gap-2 mt-1">
                          <select
                            className="flex-1 text-xs border border-gray-200 rounded-lg px-2 py-1.5 text-gray-700 bg-white"
                            value={selectedAgents[channel.id] ?? (channel.agentChannels?.[0]?.agentId || '')}
                            onChange={e => setSelectedAgents(p => ({ ...p, [channel.id]: e.target.value }))}
                          >
                            <option value="">Nenhum agente</option>
                            {(agents || []).map((a: any) => <option key={a.id} value={a.id}>{a.name}</option>)}
                          </select>
                          <Button size="sm" variant="outline" className="shrink-0 h-7 px-2"
                            disabled={assignAgentMutation.isPending}
                            onClick={() => assignAgentMutation.mutate({ channelId: channel.id, agentId: selectedAgents[channel.id] ?? '' })}>
                            {assignAgentMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                          </Button>
                        </div>
                      </div>
                      <Button variant="ghost" size="sm" onClick={() => deleteMutation.mutate(channel.id)} className="text-red-500 hover:text-red-700 hover:bg-red-50 w-full">
                        <Trash2 className="w-3 h-3 mr-2" />Desconectar
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </>
      )}

      {/* APIs & PLATAFORMAS */}
      {activeSection === 'apis' && (
        <div className="space-y-4">
          <p className="text-sm text-gray-500">
            Conecte plataformas externas para expandir as capacidades dos seus agentes.
            Integrações via webhook já funcionam pelo módulo de <strong>Intenções</strong> em cada agente.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {externalApis.map(api => (
              <div key={api.key} className={cn('rounded-xl border-2 p-5 bg-white', api.color)}>
                <div className="flex items-start justify-between mb-3">
                  <span className="text-3xl">{api.icon}</span>
                  <Badge variant="secondary" className="text-xs">{api.tag}</Badge>
                </div>
                <h3 className="font-semibold text-gray-900 mb-1">{api.label}</h3>
                <p className="text-sm text-gray-500">{api.desc}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
