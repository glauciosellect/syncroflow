'use client'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import api from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Plus, Trash2, QrCode, Loader2, Radio } from 'lucide-react'
import { useToast } from '@/components/ui/use-toast'
import { channelLabel } from '@/lib/utils'

const channelIcons: Record<string, string> = {
  WHATSAPP: '📱', INSTAGRAM: '📸', FACEBOOK: '📘', TELEGRAM: '✈️', WIDGET: '💬', EMAIL: '📧', SMS: '📩',
}

export default function ChannelsPage() {
  const { toast } = useToast()
  const qc = useQueryClient()
  const [showForm, setShowForm] = useState<string | null>(null)
  const [formData, setFormData] = useState<any>({})
  const [qrData, setQrData] = useState<Record<string, string>>({})

  const { data: channels, isLoading } = useQuery({
    queryKey: ['channels'],
    queryFn: () => api.get('/channels').then(r => r.data),
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
      setQrData(p => ({ ...p, [channelId]: res.data.qr }))
    } catch (err: any) {
      toast({ title: 'Erro', description: 'Não foi possível carregar QR Code', variant: 'destructive' })
    }
  }

  const channelForms: Record<string, { label: string; fields: any[] }> = {
    whatsapp: { label: 'WhatsApp', fields: [{ key: 'name', label: 'Nome da conexão', placeholder: 'Ex: WhatsApp Principal' }] },
    telegram: { label: 'Telegram', fields: [{ key: 'name', label: 'Nome', placeholder: 'Ex: Bot de Suporte' }, { key: 'botToken', label: 'Bot Token', placeholder: 'Obtido no @BotFather' }] },
    instagram: { label: 'Instagram', fields: [{ key: 'name', label: 'Nome', placeholder: 'Ex: Instagram da Loja' }, { key: 'pageAccessToken', label: 'Page Access Token' }, { key: 'pageId', label: 'Page ID' }] },
    widget: { label: 'Widget para Sites', fields: [{ key: 'name', label: 'Nome', placeholder: 'Ex: Widget do Site' }, { key: 'welcomeMessage', label: 'Mensagem de boas-vindas', placeholder: 'Olá! Como posso ajudar?' }] },
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Canais</h1>
          <p className="text-gray-500 text-sm mt-1">Conecte seus canais de atendimento</p>
        </div>
        <div className="flex gap-2">
          {Object.entries(channelForms).map(([key, form]) => (
            <Button key={key} variant="outline" size="sm" onClick={() => setShowForm(key)}>
              <Plus className="w-3 h-3 mr-1" />
              {form.label}
            </Button>
          ))}
        </div>
      </div>

      {showForm && channelForms[showForm] && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Conectar {channelForms[showForm].label}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {channelForms[showForm].fields.map((field: any) => (
              <div key={field.key}>
                <Label>{field.label}</Label>
                <Input placeholder={field.placeholder} value={formData[field.key] || ''} onChange={(e) => setFormData((p: any) => ({ ...p, [field.key]: e.target.value }))} className="mt-1" />
              </div>
            ))}
            <div className="flex gap-2">
              <Button onClick={() => createMutation.mutate(formData)} className="bg-violet-600 hover:bg-violet-700" disabled={createMutation.isPending}>
                {createMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                Conectar
              </Button>
              <Button variant="ghost" onClick={() => { setShowForm(null); setFormData({}) }}>Cancelar</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-violet-600" /></div>
      ) : channels?.length === 0 ? (
        <div className="text-center py-16">
          <Radio className="w-16 h-16 text-gray-200 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-gray-700 mb-2">Nenhum canal conectado</h3>
          <p className="text-gray-400">Conecte seu primeiro canal para começar a receber mensagens</p>
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
                      <img src={qrData[channel.id]} alt="QR Code" className="w-32 h-32 mx-auto rounded-lg" />
                    ) : (
                      <Button variant="outline" size="sm" onClick={() => loadQR(channel.id)} className="w-full">
                        <QrCode className="w-3 h-3 mr-2" />
                        Ver QR Code
                      </Button>
                    )}
                  </div>
                )}

                <div className="mt-3 pt-3 border-t border-gray-100">
                  <Button variant="ghost" size="sm" onClick={() => deleteMutation.mutate(channel.id)} className="text-red-500 hover:text-red-700 hover:bg-red-50 w-full">
                    <Trash2 className="w-3 h-3 mr-2" />
                    Desconectar
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
