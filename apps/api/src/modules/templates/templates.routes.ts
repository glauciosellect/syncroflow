import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'
import { getWorkspaceId } from '../../lib/workspace'

// Templates iniciais seed
const INITIAL_TEMPLATES = [
  {
    title: 'Confirmação de Pedido via WhatsApp',
    description: 'Quando um cliente faz um pedido na loja, envia automaticamente um WhatsApp com o número do pedido, valor e previsão de entrega.',
    category: 'ecommerce',
    connectorsRequired: ['nuvemshop', 'whatsapp'],
    isFeatured: true,
    tags: ['pedidos', 'whatsapp', 'nuvemshop', 'confirmacao'],
    workflowConfig: {
      trigger: { platform: 'nuvemshop', event: 'orders/created' },
      actions: [{ type: 'whatsapp', message: 'Olá {cliente.nome}! Seu pedido #{pedido.numero} foi confirmado. Valor: R$ {pedido.total}. Prazo estimado: {pedido.prazo_entrega}.' }],
    },
  },
  {
    title: 'Régua de Cobrança via WhatsApp (Asaas)',
    description: 'Envia lembretes automáticos via WhatsApp quando uma cobrança está próxima do vencimento e quando vence. Aumenta a taxa de pagamento em até 40%.',
    category: 'finance',
    connectorsRequired: ['asaas', 'whatsapp'],
    isFeatured: true,
    tags: ['cobranca', 'asaas', 'pix', 'boleto', 'inadimplencia'],
    workflowConfig: {
      trigger: { platform: 'asaas', event: 'payment_due_date' },
      actions: [
        {
          type: 'whatsapp',
          timing: 'D-3',
          daysOffset: -3,
          message: 'Olá {cliente.nome}! 👋 Passando para lembrar que sua cobrança de *R$ {cobranca.valor}* vence em 3 dias ({cobranca.vencimento}).\n\nPague com PIX agora e evite juros: {cobranca.link_pix}',
        },
        {
          type: 'whatsapp',
          timing: 'D-1',
          daysOffset: -1,
          message: 'Olá {cliente.nome}! ⏰ Seu boleto vence *amanhã*.\n\nValor: *R$ {cobranca.valor}*\nVencimento: {cobranca.vencimento}\n\nPague via PIX: {cobranca.link_pix}',
        },
        {
          type: 'whatsapp',
          timing: 'D0',
          daysOffset: 0,
          message: 'Olá {cliente.nome}! 🔔 Sua cobrança de *R$ {cobranca.valor}* vence *hoje*!\n\nEvite multa e juros pagando agora via PIX: {cobranca.link_pix}',
        },
        {
          type: 'whatsapp',
          timing: 'D+1',
          daysOffset: 1,
          message: 'Olá {cliente.nome}! Sua cobrança de *R$ {cobranca.valor}* venceu ontem. 😕\n\nRegularize agora para evitar mais encargos: {cobranca.link_pix}',
        },
        {
          type: 'whatsapp',
          timing: 'D+3',
          daysOffset: 3,
          message: 'Olá {cliente.nome}! Identificamos que sua cobrança de *R$ {cobranca.valor}* está em aberto há 3 dias.\n\nClique aqui para regularizar: {cobranca.link_pix}\n\nEm caso de dúvidas, entre em contato conosco.',
        },
      ],
    },
  },
  {
    title: 'Resposta Automática de Perguntas no Mercado Livre com IA',
    description: 'Quando um comprador faz uma pergunta no seu anúncio, a IA analisa o catálogo e responde automaticamente em segundos.',
    category: 'ecommerce',
    connectorsRequired: ['mercadolivre'],
    isFeatured: true,
    tags: ['mercadolivre', 'ia', 'perguntas', 'automatico'],
    workflowConfig: {
      trigger: { platform: 'mercadolivre', event: 'questions' },
      actions: [{ type: 'ai_response', model: 'claude-haiku-4-5', instructions: 'Responda a pergunta baseado no catálogo de produtos' }],
    },
  },
  {
    title: 'Lead do WhatsApp → Pipeline de Vendas (HubSpot)',
    description: 'Quando um cliente envia uma mensagem com interesse em comprar, cria automaticamente um contato e oportunidade no HubSpot.',
    category: 'crm',
    connectorsRequired: ['whatsapp', 'hubspot'],
    isFeatured: false,
    tags: ['crm', 'hubspot', 'leads', 'vendas'],
    workflowConfig: {
      trigger: { platform: 'whatsapp', event: 'keyword_detected', keywords: ['quero comprar', 'quanto custa', 'tem disponível'] },
      actions: [
        { type: 'crm_create_contact', platform: 'hubspot' },
        { type: 'crm_create_deal', platform: 'hubspot', stage: 'novo_lead' },
      ],
    },
  },
  {
    title: 'Pedido Pago → Emitir NF-e no Bling',
    description: 'Quando um pedido é pago na Nuvemshop, cria automaticamente o pedido no Bling e emite a NF-e, enviando por e-mail ao cliente.',
    category: 'ecommerce',
    connectorsRequired: ['nuvemshop', 'bling'],
    isFeatured: true,
    tags: ['nfe', 'bling', 'fiscal', 'nuvemshop', 'automatico'],
    workflowConfig: {
      trigger: { platform: 'nuvemshop', event: 'orders/paid' },
      actions: [
        { type: 'erp_create_order', platform: 'bling' },
        { type: 'erp_issue_invoice', platform: 'bling' },
        { type: 'email', template: 'nfe_enviada' },
      ],
    },
  },
  {
    title: 'Carrinho Abandonado → Recuperação D+1',
    description: 'Quando um cliente inicia o checkout mas não finaliza, envia um WhatsApp no dia seguinte com link para retornar ao carrinho.',
    category: 'ecommerce',
    connectorsRequired: ['nuvemshop', 'whatsapp'],
    isFeatured: false,
    tags: ['carrinho-abandonado', 'recuperacao', 'whatsapp', 'conversao'],
    workflowConfig: {
      trigger: { platform: 'nuvemshop', event: 'checkouts/delete' },
      actions: [{ type: 'whatsapp', delay: '24h', message: 'Olá {cliente.nome}! Você esqueceu algo no carrinho 😊 Volte e finalize sua compra: {carrinho.link}' }],
    },
  },
  {
    title: 'Alerta de Estoque Crítico para o Gestor',
    description: 'Quando um produto atinge o estoque mínimo, envia WhatsApp para o gestor com o nome do produto e quantidade atual.',
    category: 'ecommerce',
    connectorsRequired: ['whatsapp'],
    isFeatured: false,
    tags: ['estoque', 'alerta', 'gestor', 'whatsapp'],
    workflowConfig: {
      trigger: { platform: 'any', event: 'low_stock', threshold: 5 },
      actions: [{ type: 'whatsapp', recipient: 'manager', message: '⚠️ Estoque crítico: {produto.nome} — Apenas {produto.estoque} unidades restantes.' }],
    },
  },
  {
    title: 'Novo Cliente → Mensagem de Boas-Vindas',
    description: 'Quando um novo cliente se cadastra, envia uma mensagem de boas-vindas calorosa via WhatsApp com um cupom de desconto na primeira compra.',
    category: 'ecommerce',
    connectorsRequired: ['whatsapp'],
    isFeatured: false,
    tags: ['boas-vindas', 'novo-cliente', 'fidelizacao', 'cupom'],
    workflowConfig: {
      trigger: { platform: 'any', event: 'new_customer' },
      actions: [{ type: 'whatsapp', message: 'Seja bem-vindo(a), {cliente.nome}! 🎉 Use o cupom BEMVINDO10 para 10% de desconto na primeira compra.' }],
    },
  },
  {
    title: 'Novo Pedido TikTok Shop → Confirmação Automática',
    description: 'CRÍTICO: O TikTok Shop cancela o pedido automaticamente se não confirmado em 2 dias. Este template confirma o pedido na hora e notifica o gestor.',
    category: 'ecommerce',
    connectorsRequired: ['tiktokshop', 'whatsapp'],
    isFeatured: true,
    tags: ['tiktok-shop', 'confirmacao', 'urgente', 'automatico'],
    workflowConfig: {
      trigger: { platform: 'tiktokshop', event: 'order/created' },
      actions: [
        { type: 'tiktokshop_confirm_order' },
        { type: 'whatsapp', recipient: 'manager', message: '🛒 Novo pedido TikTok Shop #{pedido.id}! Já confirmado. Valor: {pedido.valor}. Prazo de envio: 2 dias.' },
      ],
    },
  },
  {
    title: 'Mensagem Shopee → Resposta Automática IA',
    description: 'CRÍTICO: Shopee penaliza vendedores que não respondem em 12h. Este template responde automaticamente com IA para perguntas frequentes.',
    category: 'ecommerce',
    connectorsRequired: ['shopee'],
    isFeatured: true,
    tags: ['shopee', 'ia', 'resposta-automatica', 'ranking'],
    workflowConfig: {
      trigger: { platform: 'shopee', event: 'new_message' },
      actions: [
        { type: 'ai_response', model: 'claude-haiku-4-5', fallback: 'notify_manager' },
      ],
    },
  },
]

export async function templateRoutes(app: FastifyInstance) {
  // ─── Rotas públicas ───────────────────────────────────────────────────────────

  // Listar templates públicos aprovados
  app.get<{ Querystring: { category?: string; search?: string; featured?: string; page?: string } }>(
    '/templates',
    async (req, reply) => {
      const { category, search, featured, page: pageStr } = req.query
      const page = Number(pageStr ?? 1)
      const limit = 20
      const skip = (page - 1) * limit

      const where: any = { isApproved: true }
      if (category) where.category = category
      if (featured === 'true') where.isFeatured = true
      if (search) where.title = { contains: search, mode: 'insensitive' }

      const [templates, total] = await Promise.all([
        prisma.publicTemplate.findMany({
          where,
          orderBy: [{ isFeatured: 'desc' }, { usesCount: 'desc' }, { createdAt: 'desc' }],
          skip,
          take: limit,
          select: {
            id: true, title: true, description: true, category: true,
            connectorsRequired: true, usesCount: true, isFeatured: true, tags: true, createdAt: true,
          },
        }),
        prisma.publicTemplate.count({ where }),
      ])

      return reply.send({ templates, total, page, totalPages: Math.ceil(total / limit) })
    }
  )

  // Buscar template por ID
  app.get<{ Params: { id: string } }>('/templates/:id', async (req, reply) => {
    const template = await prisma.publicTemplate.findFirst({
      where: { id: req.params.id, isApproved: true },
    })
    if (!template) return reply.status(404).send({ error: 'Template não encontrado' })
    return reply.send(template)
  })

  // Listar categorias disponíveis
  app.get('/templates/meta/categories', async (_req, reply) => {
    const categories = [
      { slug: 'ecommerce', label: 'E-commerce & Marketplaces', icon: '🛍️' },
      { slug: 'crm', label: 'CRM & Vendas', icon: '🤝' },
      { slug: 'finance', label: 'Financeiro & Cobrança', icon: '💰' },
      { slug: 'marketing', label: 'Marketing & Leads', icon: '📣' },
      { slug: 'ai', label: 'Inteligência Artificial', icon: '🤖' },
      { slug: 'general', label: 'Geral', icon: '⚡' },
    ]
    return reply.send(categories)
  })

  // ─── Rotas autenticadas ───────────────────────────────────────────────────────

  // Usar (clonar) um template para o workspace
  app.post<{ Params: { id: string } }>(
    '/templates/:id/use',
    { preHandler: app.authenticate },
    async (req, reply) => {
      const { sub, wid } = req.user as { sub: string; wid?: string }
      const workspaceId = await getWorkspaceId(sub, wid)

      const template = await prisma.publicTemplate.findFirst({
        where: { id: req.params.id, isApproved: true },
      })
      if (!template) return reply.status(404).send({ error: 'Template não encontrado' })

      // Incrementar contador de uso
      await prisma.publicTemplate.update({
        where: { id: template.id },
        data: { usesCount: { increment: 1 } },
      })

      // Retorna a configuração para o frontend aplicar
      return reply.send({
        ok: true,
        template: {
          title: template.title,
          description: template.description,
          connectorsRequired: template.connectorsRequired,
          workflowConfig: template.workflowConfig,
        },
        message: `Template "${template.title}" carregado! Configure as conexões necessárias e ative.`,
      })
    }
  )

  // Publicar template (submeter para aprovação)
  app.post<{ Body: { title: string; description: string; category: string; tags?: string[]; workflowConfig: any } }>(
    '/templates',
    { preHandler: app.authenticate },
    async (req, reply) => {
      const { sub, wid } = req.user as { sub: string; wid?: string }
      const workspaceId = await getWorkspaceId(sub, wid)

      const data = z.object({
        title: z.string().min(5).max(100),
        description: z.string().min(10).max(500),
        category: z.enum(['ecommerce', 'crm', 'finance', 'marketing', 'ai', 'general']),
        tags: z.array(z.string()).max(10).optional(),
        workflowConfig: z.record(z.any()),
      }).parse(req.body)

      // Detecta conectores necessários automaticamente
      const config = JSON.stringify(data.workflowConfig).toLowerCase()
      const knownPlatforms = ['nuvemshop', 'shopify', 'mercadolivre', 'whatsapp', 'hubspot', 'pipedrive', 'asaas', 'pagarme', 'bling', 'tiktokshop', 'shopee']
      const connectorsRequired = knownPlatforms.filter(p => config.includes(p))

      // Anonimiza tokens e IDs sensíveis do config
      const safeConfig = JSON.parse(
        JSON.stringify(data.workflowConfig)
          .replace(/"access_token":"[^"]+"/g, '"access_token":"[REDACTED]"')
          .replace(/"api_key":"[^"]+"/g, '"api_key":"[REDACTED]"')
      )

      const template = await prisma.publicTemplate.create({
        data: {
          title: data.title,
          description: data.description,
          category: data.category,
          tags: data.tags ?? [],
          connectorsRequired,
          workflowConfig: safeConfig,
          isApproved: false, // vai para fila de aprovação manual
          createdByWorkspace: workspaceId,
        },
      })

      return reply.status(201).send({
        ok: true,
        id: template.id,
        message: 'Template enviado para revisão. Será publicado após aprovação da equipe SyncroFlow.',
      })
    }
  )
}

// ─── Seed inicial de templates ────────────────────────────────────────────────

export async function seedTemplates() {
  for (const tpl of INITIAL_TEMPLATES) {
    const existing = await prisma.publicTemplate.findFirst({ where: { title: tpl.title } })
    if (existing) {
      await prisma.publicTemplate.update({
        where: { id: existing.id },
        data: {
          description: tpl.description,
          category: tpl.category,
          connectorsRequired: tpl.connectorsRequired,
          isFeatured: tpl.isFeatured,
          tags: tpl.tags,
          workflowConfig: tpl.workflowConfig as any,
        },
      })
    } else {
      await prisma.publicTemplate.create({ data: { ...tpl, workflowConfig: tpl.workflowConfig as any } })
    }
  }
  console.log(`[Templates] ${INITIAL_TEMPLATES.length} templates sincronizados.`)
}
