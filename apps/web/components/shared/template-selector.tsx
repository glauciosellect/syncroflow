'use client'
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useToast } from '@/components/ui/use-toast'
import { Loader2, Send, AlertTriangle } from 'lucide-react'

interface WhatsAppTemplate {
  name: string
  language: string
  status: string
  category: string
  bodyText?: string
  variableCount: number
}

// Substitui o MessageComposer quando a conversa exige template aprovado
// pela Meta (contato que nunca escreveu antes — texto livre não é entregue
// nesse caso). Mostra os templates aprovados do canal e monta a prévia
// substituindo {{1}}, {{2}}... pelos valores digitados.
export function TemplateSelector({ channelId, conversationId }: { channelId: string; conversationId: string }) {
  const qc = useQueryClient()
  const { toast } = useToast()
  const [selectedName, setSelectedName] = useState<string>('')
  const [params, setParams] = useState<string[]>([])

  const { data: templates, isLoading, isError } = useQuery<WhatsAppTemplate[]>({
    queryKey: ['whatsapp-templates', channelId],
    queryFn: () => api.get(`/channels/${channelId}/templates`).then(r => r.data),
  })

  const selected = templates?.find(t => t.name === selectedName)

  const sendMutation = useMutation({
    mutationFn: () => {
      const previewText = buildPreview(selected?.bodyText, params)
      return api.post(`/conversations/${conversationId}/send-template`, {
        templateName: selected!.name,
        languageCode: selected!.language,
        params,
        previewText,
      })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['messages', conversationId] })
      setSelectedName('')
      setParams([])
      toast({ title: 'Template enviado!' })
    },
    onError: (err: any) => toast({ title: 'Erro ao enviar template', description: err?.response?.data?.error || 'Tente novamente', variant: 'destructive' }),
  })

  const handleSelectTemplate = (name: string) => {
    setSelectedName(name)
    const tpl = templates?.find(t => t.name === name)
    setParams(new Array(tpl?.variableCount ?? 0).fill(''))
  }

  if (isLoading) {
    return (
      <div className="p-4 border-t border-gray-100 flex items-center justify-center">
        <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
      </div>
    )
  }

  if (isError || !templates || templates.length === 0) {
    return (
      <div className="p-4 border-t border-gray-100 bg-amber-50">
        <div className="flex items-start gap-2 text-sm text-amber-800">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <div>
            <p className="font-medium">Nenhum template aprovado encontrado.</p>
            <p className="text-xs text-amber-700 mt-0.5">
              Esse contato ainda não escreveu para você — o WhatsApp só permite iniciar conversa com uma mensagem de template aprovada pela Meta.
              Crie um template em business.facebook.com → WhatsApp Manager → Modelos de mensagem.
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="p-4 border-t border-gray-100 space-y-3 bg-amber-50/50">
      <div className="flex items-center gap-2 text-xs text-amber-800">
        <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
        Esse contato ainda não escreveu para você — envie um template aprovado para iniciar a conversa.
      </div>

      <select
        className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white"
        value={selectedName}
        onChange={(e) => handleSelectTemplate(e.target.value)}
      >
        <option value="">Escolha um template...</option>
        {templates.map(t => (
          <option key={t.name} value={t.name}>{t.name} ({t.language})</option>
        ))}
      </select>

      {selected && (
        <div className="space-y-2">
          {selected.bodyText && (
            <p className="text-xs text-gray-500 bg-white border border-gray-100 rounded-lg p-2">
              {buildPreview(selected.bodyText, params) || selected.bodyText}
            </p>
          )}
          {params.map((val, i) => (
            <Input
              key={i}
              value={val}
              onChange={(e) => setParams(p => p.map((v, idx) => idx === i ? e.target.value : v))}
              placeholder={`Variável {{${i + 1}}}`}
              className="text-sm"
            />
          ))}
          <Button
            className="w-full bg-[#1565C0] hover:bg-[#0D47A1]"
            disabled={sendMutation.isPending || params.some(p => !p.trim())}
            onClick={() => sendMutation.mutate()}
          >
            {sendMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Send className="w-4 h-4 mr-2" />}
            Enviar template
          </Button>
        </div>
      )}
    </div>
  )
}

function buildPreview(bodyText: string | undefined, params: string[]): string {
  if (!bodyText) return ''
  let result = bodyText
  params.forEach((val, i) => {
    result = result.replace(`{{${i + 1}}}`, val || `{{${i + 1}}}`)
  })
  return result
}
