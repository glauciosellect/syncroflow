'use client'
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'
import { useToast } from '@/components/ui/use-toast'
import { Megaphone, Plus, Loader2, X, ShieldCheck } from 'lucide-react'
import { formatDateTime } from '@/lib/utils'

const statusLabel: Record<string, { text: string; cls: string }> = {
  QUEUED: { text: 'Na fila', cls: 'bg-gray-100 text-gray-600' },
  SENDING: { text: 'Enviando', cls: 'bg-blue-100 text-blue-700' },
  COMPLETED: { text: 'Concluída', cls: 'bg-green-100 text-green-700' },
  COMPLETED_WITH_ERRORS: { text: 'Concluída com erros', cls: 'bg-amber-100 text-amber-700' },
  CANCELLED: { text: 'Cancelada', cls: 'bg-red-100 text-red-600' },
}

export default function CampaignsPage() {
  const qc = useQueryClient()
  const [creating, setCreating] = useState(false)

  const { data: campaigns, isLoading } = useQuery({
    queryKey: ['campaigns'],
    queryFn: () => api.get('/campaigns').then(r => r.data as any[]),
    refetchInterval: 8000,
  })

  const cancel = useMutation({
    mutationFn: (id: string) => api.post(`/campaigns/${id}/cancel`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['campaigns'] }),
  })

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2"><Megaphone className="w-6 h-6 text-[#1565C0]" /> Campanhas</h1>
          <p className="text-gray-500 text-sm mt-1">Envie uma mensagem para vários contatos de forma controlada, sem arriscar o seu número.</p>
        </div>
        <Button className="bg-[#1565C0] hover:bg-[#0D47A1]" onClick={() => setCreating(true)}><Plus className="w-4 h-4 mr-1.5" />Nova campanha</Button>
      </div>

      <Card>
        <CardContent className="py-3 text-xs text-gray-600 flex gap-2">
          <ShieldCheck className="w-4 h-4 text-green-600 shrink-0 mt-0.5" />
          <span>
            Para proteger seu número: no WhatsApp só vai modelo de mensagem aprovado pela Meta, com 1 envio a cada 3 segundos, até 250 em 24h e 500 por campanha.
            Quem responder PARAR ou SAIR é descadastrado e nunca mais recebe campanha.
          </span>
        </CardContent>
      </Card>

      {isLoading ? (
        <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
      ) : !campaigns?.length ? (
        <p className="text-sm text-gray-400">Nenhuma campanha ainda.</p>
      ) : (
        <div className="space-y-2">
          {campaigns.map(c => {
            const st = statusLabel[c.status] ?? statusLabel.QUEUED
            const done = c.sentCount + c.failedCount
            const pct = c.totalTargets ? Math.round((done / c.totalTargets) * 100) : 0
            return (
              <Card key={c.id}>
                <CardContent className="py-3 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium text-gray-900 truncate">{c.name}</p>
                    <p className="text-xs text-gray-400">
                      {c.channelType === 'EMAIL' ? 'E-mail' : 'WhatsApp'} · {formatDateTime(c.createdAt)}
                      {c.tag ? ` · etiqueta "${c.tag}"` : ''}
                    </p>
                    <p className="text-xs text-gray-500 mt-1">{c.sentCount} enviadas · {c.failedCount} falhas · {c.totalTargets} contatos ({pct}%)</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${st.cls}`}>{st.text}</span>
                    {(c.status === 'QUEUED' || c.status === 'SENDING') && (
                      <Button size="sm" variant="outline" className="h-7 text-xs text-red-500 border-red-200" onClick={() => { if (confirm('Cancelar esta campanha? Os envios que faltam não serão feitos.')) cancel.mutate(c.id) }}>
                        Cancelar
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {creating && <NewCampaign onClose={() => setCreating(false)} onCreated={() => { setCreating(false); qc.invalidateQueries({ queryKey: ['campaigns'] }) }} />}
    </div>
  )
}

function NewCampaign({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const { toast } = useToast()
  const [name, setName] = useState('')
  const [channelType, setChannelType] = useState<'WHATSAPP' | 'EMAIL'>('WHATSAPP')
  const [channelId, setChannelId] = useState('')
  const [templateName, setTemplateName] = useState('')
  const [params, setParams] = useState<string[]>([])
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [tag, setTag] = useState('')

  const { data: channels } = useQuery({
    queryKey: ['channels'],
    queryFn: () => api.get('/channels').then(r => r.data as any[]),
  })
  const waChannels = (channels ?? []).filter(c => c.type === 'WHATSAPP' && c.isActive)
  const activeChannelId = channelId || waChannels[0]?.id || ''

  const { data: templates, isLoading: loadingTpl, error: tplError } = useQuery({
    queryKey: ['whatsapp-templates', activeChannelId],
    queryFn: () => api.get(`/channels/${activeChannelId}/templates`).then(r => r.data as any[]),
    enabled: channelType === 'WHATSAPP' && !!activeChannelId,
    retry: false,
  })
  const approved = (templates ?? []).filter(t => String(t.status).toUpperCase() === 'APPROVED')
  const selected = approved.find(t => t.name === templateName)

  const { data: preview } = useQuery({
    queryKey: ['campaign-preview', channelType, tag],
    queryFn: () => api.get('/campaigns/preview', { params: { channelType, tag: tag || undefined } }).then(r => r.data),
  })

  function pickTemplate(nameValue: string) {
    setTemplateName(nameValue)
    const t = approved.find(x => x.name === nameValue)
    // {{1}} costuma ser o nome do cliente: sugere {{nome}}, que vira o primeiro nome de cada contato.
    setParams(Array.from({ length: t?.variableCount ?? 0 }, (_, i) => (i === 0 ? '{{nome}}' : '')))
  }

  function buildPreview() {
    let text: string = selected?.bodyText ?? ''
    params.forEach((v, i) => { text = text.split(`{{${i + 1}}}`).join(v || `{{${i + 1}}}`) })
    return text
  }

  const create = useMutation({
    mutationFn: () => api.post('/campaigns', channelType === 'WHATSAPP'
      ? { name, channelType, channelId: activeChannelId, templateName, templateLanguage: selected?.language, templateParams: params, previewText: buildPreview(), tag: tag || undefined }
      : { name, channelType, emailSubject: subject, emailBody: body, tag: tag || undefined }),
    onSuccess: onCreated,
    onError: (err: any) => toast({ title: 'Não foi possível criar a campanha', description: err?.response?.data?.error || 'Confira os dados.', variant: 'destructive' }),
  })

  const canSubmit = name.trim().length >= 2 && (channelType === 'WHATSAPP'
    ? !!templateName && params.every(p => p.trim())
    : !!subject.trim() && !!body.trim())

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl bg-white p-5 shadow-xl space-y-4" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Nova campanha</h2>
          <button onClick={onClose} className="rounded-full p-1 hover:bg-gray-100"><X className="w-4 h-4" /></button>
        </div>

        <div className="space-y-1"><Label>Nome da campanha</Label><Input value={name} onChange={e => setName(e.target.value)} placeholder="Ex: Novidades de novembro" /></div>

        <div className="space-y-1">
          <Label>Canal</Label>
          <div className="flex gap-2">
            {(['WHATSAPP', 'EMAIL'] as const).map(t => (
              <button key={t} onClick={() => setChannelType(t)} className={`px-3 py-1.5 rounded-lg border text-sm ${channelType === t ? 'border-[#1565C0] bg-blue-50 text-[#1565C0]' : 'border-gray-200 text-gray-600'}`}>
                {t === 'WHATSAPP' ? 'WhatsApp' : 'E-mail'}
              </button>
            ))}
          </div>
        </div>

        {channelType === 'WHATSAPP' ? (
          <>
            {waChannels.length > 1 && (
              <div className="space-y-1"><Label>Número</Label>
                <select className="w-full border border-gray-200 rounded-md px-2 py-2 text-sm" value={activeChannelId} onChange={e => { setChannelId(e.target.value); setTemplateName('') }}>
                  {waChannels.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
            )}
            <div className="space-y-1">
              <Label>Modelo de mensagem aprovado</Label>
              {loadingTpl ? <Loader2 className="w-4 h-4 animate-spin text-gray-400" /> : tplError ? (
                <p className="text-sm text-red-600">Não consegui buscar os modelos na Meta.</p>
              ) : approved.length === 0 ? (
                <p className="text-sm text-gray-500">Nenhum modelo aprovado. Crie um na Meta (categoria Marketing ou Utilidade) e aguarde a aprovação.</p>
              ) : (
                <select className="w-full border border-gray-200 rounded-md px-2 py-2 text-sm" value={templateName} onChange={e => pickTemplate(e.target.value)}>
                  <option value="">Escolha…</option>
                  {approved.map(t => <option key={`${t.name}-${t.language}`} value={t.name}>{t.name} ({t.language})</option>)}
                </select>
              )}
            </div>
            {selected && (
              <>
                {params.map((v, i) => (
                  <div className="space-y-1" key={i}>
                    <Label>Variável {`{{${i + 1}}}`}</Label>
                    <Input value={v} onChange={e => setParams(ps => ps.map((x, j) => j === i ? e.target.value : x))} placeholder="Use {{nome}} para o primeiro nome do contato" />
                  </div>
                ))}
                <div className="rounded-lg bg-green-50 border border-green-100 p-3 text-sm text-gray-700 whitespace-pre-wrap">{buildPreview() || selected.bodyText}</div>
                <p className="text-xs text-gray-500">Dica: inclua no modelo uma linha como "Responda PARAR para não receber mais".</p>
              </>
            )}
          </>
        ) : (
          <>
            <div className="space-y-1"><Label>Assunto</Label><Input value={subject} onChange={e => setSubject(e.target.value)} /></div>
            <div className="space-y-1"><Label>Mensagem</Label>
              <textarea rows={6} value={body} onChange={e => setBody(e.target.value)} placeholder="Olá {{nome}}, ..." className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm" />
            </div>
            <p className="text-xs text-gray-500">O e-mail sai pelo servidor de e-mail configurado no SyncroFlow e leva um aviso para responder SAIR.</p>
          </>
        )}

        <div className="space-y-1">
          <Label>Filtrar por etiqueta (opcional)</Label>
          <Input value={tag} onChange={e => setTag(e.target.value)} placeholder="Deixe vazio para todos os contatos" />
        </div>

        {preview && (
          <div className="text-xs text-gray-600 rounded-lg bg-gray-50 p-3 space-y-0.5">
            <p><strong>{preview.totalTargets}</strong> contatos receberão{preview.moreThanLimit ? ` (há mais de ${preview.maxTargets}: use uma etiqueta para dividir)` : ''}.</p>
            <p>Já enviados nas últimas 24h: {preview.sentLast24h} de {preview.max24h}.</p>
            {channelType === 'WHATSAPP' && <p>Mensagens ativas restantes no plano: {preview.activeMsgsRemaining}.</p>}
          </div>
        )}

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button className="bg-[#1565C0] hover:bg-[#0D47A1]" disabled={!canSubmit || create.isPending} onClick={() => {
            if (confirm(`Enviar para ${preview?.totalTargets ?? 'todos os'} contatos? Os envios saem 1 a cada 3 segundos.`)) create.mutate()
          }}>
            {create.isPending && <Loader2 className="w-4 h-4 animate-spin mr-2" />}Enviar campanha
          </Button>
        </div>
      </div>
    </div>
  )
}
