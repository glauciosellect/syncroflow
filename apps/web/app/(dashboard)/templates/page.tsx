'use client'
import { useState } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import api from '@/lib/api'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/use-toast'
import { Loader2, Search, Star, Zap, ChevronRight, CheckCircle } from 'lucide-react'
import { cn } from '@/lib/utils'

const CATEGORIES = [
  { slug: 'all',       label: 'Todos',                    icon: '⚡' },
  { slug: 'ecommerce', label: 'E-commerce & Marketplaces', icon: '🛍️' },
  { slug: 'crm',       label: 'CRM & Vendas',              icon: '🤝' },
  { slug: 'finance',   label: 'Financeiro & Cobrança',     icon: '💰' },
  { slug: 'marketing', label: 'Marketing & Leads',         icon: '📣' },
  { slug: 'ai',        label: 'Inteligência Artificial',   icon: '🤖' },
  { slug: 'general',   label: 'Geral',                    icon: '🔧' },
]

const CONNECTOR_LABELS: Record<string, string> = {
  nuvemshop: 'Nuvemshop', shopify: 'Shopify', mercadolivre: 'Mercado Livre',
  whatsapp: 'WhatsApp', hubspot: 'HubSpot', pipedrive: 'Pipedrive',
  asaas: 'Asaas', pagarme: 'Pagar.me', bling: 'Bling',
  tiktokshop: 'TikTok Shop', shopee: 'Shopee', activecampaign: 'ActiveCampaign',
}

interface Template {
  id: string
  title: string
  description: string
  category: string
  connectorsRequired: string[]
  usesCount: number
  isFeatured: boolean
  tags: string[]
  createdAt: string
}

interface TemplateDetail extends Template {
  workflowConfig: any
}

export default function TemplatesPage() {
  const { toast } = useToast()
  const [category, setCategory] = useState('all')
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<TemplateDetail | null>(null)
  const [used, setUsed] = useState<Set<string>>(new Set())

  const { data, isLoading } = useQuery<{ templates: Template[]; total: number }>({
    queryKey: ['templates', category, search],
    queryFn: () => {
      const params = new URLSearchParams()
      if (category !== 'all') params.set('category', category)
      if (search.trim()) params.set('search', search.trim())
      return api.get(`/templates?${params}`).then(r => r.data)
    },
  })

  const detailQuery = useQuery<TemplateDetail>({
    queryKey: ['template-detail', selected?.id],
    queryFn: () => api.get(`/templates/${selected!.id}`).then(r => r.data),
    enabled: !!selected,
  })

  const useMutation_ = useMutation({
    mutationFn: (id: string) => api.post(`/templates/${id}/use`).then(r => r.data),
    onSuccess: (data: any, id: string) => {
      setUsed(prev => new Set(Array.from(prev).concat(id)))
      toast({
        title: '✅ Template aplicado!',
        description: data.message,
      })
    },
    onError: () => toast({ title: 'Erro ao usar template', variant: 'destructive' }),
  })

  const templates = data?.templates ?? []
  const featured = templates.filter(t => t.isFeatured)
  const rest = templates.filter(t => !t.isFeatured)

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">Marketplace de Templates</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Automações prontas para usar. Clique em "Usar template" e configure em segundos.
        </p>
      </div>

      {/* Detalhe do template selecionado */}
      {selected && (
        <div className="bg-card border rounded-2xl p-6 space-y-5">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                {selected.isFeatured && (
                  <span className="flex items-center gap-1 text-xs font-semibold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">
                    <Star className="w-3 h-3 fill-amber-500 text-amber-500" /> Destaque
                  </span>
                )}
                <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full capitalize">
                  {CATEGORIES.find(c => c.slug === selected.category)?.label ?? selected.category}
                </span>
              </div>
              <h2 className="text-xl font-bold">{selected.title}</h2>
              <p className="text-sm text-muted-foreground max-w-2xl">{selected.description}</p>
            </div>
            <Button variant="ghost" size="sm" onClick={() => setSelected(null)} className="shrink-0">
              Voltar
            </Button>
          </div>

          {/* Conectores necessários */}
          {selected.connectorsRequired.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Conectores necessários</p>
              <div className="flex flex-wrap gap-2">
                {selected.connectorsRequired.map(c => (
                  <span key={c} className="text-xs px-3 py-1 rounded-full border bg-background font-medium">
                    {CONNECTOR_LABELS[c] ?? c}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Tags */}
          {selected.tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {selected.tags.map(tag => (
                <span key={tag} className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                  #{tag}
                </span>
              ))}
            </div>
          )}

          {/* Config preview */}
          {detailQuery.data?.workflowConfig && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Configuração da automação</p>
              <pre className="text-xs bg-muted rounded-xl p-4 overflow-auto max-h-48 leading-relaxed">
                {JSON.stringify(detailQuery.data.workflowConfig, null, 2)}
              </pre>
            </div>
          )}

          {/* Ação */}
          <div className="flex items-center gap-3 pt-2">
            {used.has(selected.id) ? (
              <div className="flex items-center gap-2 text-green-600 font-medium text-sm">
                <CheckCircle className="w-4 h-4" /> Template aplicado com sucesso!
              </div>
            ) : (
              <Button
                onClick={() => useMutation_.mutate(selected.id)}
                disabled={useMutation_.isPending}
                className="gap-2"
              >
                {useMutation_.isPending
                  ? <Loader2 className="w-4 h-4 animate-spin" />
                  : <Zap className="w-4 h-4" />}
                Usar este template
              </Button>
            )}
            <span className="text-xs text-muted-foreground">{selected.usesCount} usos</span>
          </div>
        </div>
      )}

      {/* Busca + filtros */}
      {!selected && (
        <>
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                className="w-full pl-9 pr-4 py-2.5 text-sm border rounded-xl bg-background"
                placeholder="Buscar templates..."
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
          </div>

          {/* Categorias */}
          <div className="flex gap-2 flex-wrap">
            {CATEGORIES.map(cat => (
              <button
                key={cat.slug}
                onClick={() => setCategory(cat.slug)}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-full border transition-all',
                  category === cat.slug
                    ? 'bg-foreground text-background border-foreground'
                    : 'bg-background text-muted-foreground hover:text-foreground border-border'
                )}
              >
                <span>{cat.icon}</span> {cat.label}
              </button>
            ))}
          </div>

          {isLoading ? (
            <div className="flex justify-center py-16">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : templates.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              <p className="text-lg font-medium">Nenhum template encontrado</p>
              <p className="text-sm mt-1">Tente outra categoria ou termo de busca</p>
            </div>
          ) : (
            <>
              {/* Destaques */}
              {featured.length > 0 && category === 'all' && !search && (
                <div className="space-y-3">
                  <h2 className="font-semibold text-sm text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                    <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" /> Em destaque
                  </h2>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {featured.map(t => (
                      <TemplateCard key={t.id} template={t} used={used.has(t.id)}
                        onSelect={() => setSelected(t as TemplateDetail)}
                        onUse={() => useMutation_.mutate(t.id)}
                        loading={useMutation_.isPending} />
                    ))}
                  </div>
                </div>
              )}

              {/* Todos / resto */}
              {(rest.length > 0 || category !== 'all' || search) && (
                <div className="space-y-3">
                  {category === 'all' && !search && rest.length > 0 && (
                    <h2 className="font-semibold text-sm text-muted-foreground uppercase tracking-wider">Todos os templates</h2>
                  )}
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {(category !== 'all' || search ? templates : rest).map(t => (
                      <TemplateCard key={t.id} template={t} used={used.has(t.id)}
                        onSelect={() => setSelected(t as TemplateDetail)}
                        onUse={() => useMutation_.mutate(t.id)}
                        loading={useMutation_.isPending} />
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  )
}

// ─── Card de template ─────────────────────────────────────────────────────────

function TemplateCard({
  template, used, onSelect, onUse, loading,
}: {
  template: Template
  used: boolean
  onSelect: () => void
  onUse: () => void
  loading: boolean
}) {
  return (
    <div className="p-4 border rounded-xl bg-card space-y-3 hover:shadow-md transition-all flex flex-col">
      <div className="flex items-start justify-between gap-2">
        <div className="space-y-1 flex-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            {template.isFeatured && (
              <Star className="w-3 h-3 fill-amber-400 text-amber-400 shrink-0" />
            )}
            <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
              {CATEGORIES.find(c => c.slug === template.category)?.icon} {template.category}
            </span>
          </div>
          <p className="font-semibold text-sm leading-snug">{template.title}</p>
          <p className="text-xs text-muted-foreground line-clamp-2">{template.description}</p>
        </div>
      </div>

      {/* Conectores */}
      {template.connectorsRequired.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {template.connectorsRequired.slice(0, 3).map(c => (
            <span key={c} className="text-[10px] px-2 py-0.5 rounded-full border bg-muted/50 text-muted-foreground">
              {CONNECTOR_LABELS[c] ?? c}
            </span>
          ))}
          {template.connectorsRequired.length > 3 && (
            <span className="text-[10px] px-2 py-0.5 rounded-full border bg-muted/50 text-muted-foreground">
              +{template.connectorsRequired.length - 3}
            </span>
          )}
        </div>
      )}

      <div className="flex items-center gap-2 mt-auto pt-1">
        {used ? (
          <div className="flex items-center gap-1.5 text-xs text-green-600 font-medium">
            <CheckCircle className="w-3.5 h-3.5" /> Aplicado
          </div>
        ) : (
          <Button size="sm" className="text-xs h-7 px-3 gap-1" onClick={onUse} disabled={loading}>
            {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Zap className="w-3 h-3" />}
            Usar
          </Button>
        )}
        <Button variant="ghost" size="sm" className="text-xs h-7 px-2 gap-1 ml-auto" onClick={onSelect}>
          Ver detalhes <ChevronRight className="w-3 h-3" />
        </Button>
        <span className="text-[10px] text-muted-foreground">{template.usesCount} usos</span>
      </div>
    </div>
  )
}
