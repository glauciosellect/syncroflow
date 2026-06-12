import Anthropic from '@anthropic-ai/sdk'
import { prisma } from '../../lib/prisma'
import { decrypt } from '../../lib/crypto'
import { logger } from '../../lib/logger'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

// ─── Definição das Tools disponíveis para o agente ───────────────────────────

export const AGENT_TOOLS: Anthropic.Tool[] = [
  {
    name: 'consultar_pedido',
    description: 'Consulta o status e detalhes de um pedido do cliente. Use quando o cliente perguntar sobre o status de uma compra, onde está o produto, prazo de entrega, ou qualquer dúvida sobre um pedido específico.',
    input_schema: {
      type: 'object',
      properties: {
        numero_pedido: { type: 'string', description: 'Número ou ID do pedido' },
        telefone_cliente: { type: 'string', description: 'Telefone do cliente para buscar pedidos por telefone quando não souber o número' },
      },
      required: [],
    },
  },
  {
    name: 'gerar_link_pagamento',
    description: 'Gera um link de pagamento PIX ou boleto para o cliente. Use quando o cliente precisar pagar uma fatura, segunda via de boleto, ou qualquer cobrança.',
    input_schema: {
      type: 'object',
      properties: {
        nome_cliente: { type: 'string', description: 'Nome completo do cliente' },
        valor: { type: 'number', description: 'Valor a cobrar em reais (ex: 150.00)' },
        descricao: { type: 'string', description: 'Descrição da cobrança' },
        cpf_cnpj: { type: 'string', description: 'CPF ou CNPJ do cliente (opcional, melhora a identificação)' },
        email_cliente: { type: 'string', description: 'Email do cliente (opcional)' },
      },
      required: ['nome_cliente', 'valor', 'descricao'],
    },
  },
  {
    name: 'agendar_horario',
    description: 'Agenda um horário ou consulta disponibilidade na agenda do negócio. Use quando o cliente quiser marcar uma consulta, reunião, visita, ou qualquer tipo de agendamento.',
    input_schema: {
      type: 'object',
      properties: {
        nome_cliente: { type: 'string', description: 'Nome do cliente' },
        data_preferida: { type: 'string', description: 'Data preferida (ex: amanhã, sexta-feira, 20/06/2026)' },
        horario_preferido: { type: 'string', description: 'Horário preferido (ex: 14h, manhã, tarde)' },
        servico: { type: 'string', description: 'Tipo de serviço ou motivo do agendamento' },
        telefone: { type: 'string', description: 'Telefone de contato do cliente' },
      },
      required: ['nome_cliente', 'servico'],
    },
  },
  {
    name: 'criar_lead',
    description: 'Registra um novo lead ou contato no CRM. Use quando identificar que o cliente tem interesse em um produto/serviço e quer ser contactado, ou quando precisar registrar dados de um potencial cliente.',
    input_schema: {
      type: 'object',
      properties: {
        nome: { type: 'string', description: 'Nome do lead' },
        telefone: { type: 'string', description: 'Telefone do lead' },
        email: { type: 'string', description: 'Email do lead (opcional)' },
        interesse: { type: 'string', description: 'Produto ou serviço de interesse' },
        observacoes: { type: 'string', description: 'Observações ou contexto da conversa' },
      },
      required: ['nome', 'telefone'],
    },
  },
  {
    name: 'verificar_estoque',
    description: 'Verifica a disponibilidade e quantidade em estoque de um produto. Use quando o cliente perguntar se um produto está disponível, em quantas cores/tamanhos, ou se vai ter reposição.',
    input_schema: {
      type: 'object',
      properties: {
        nome_produto: { type: 'string', description: 'Nome ou descrição do produto' },
        variacao: { type: 'string', description: 'Variação específica (cor, tamanho, modelo) se mencionada' },
      },
      required: ['nome_produto'],
    },
  },
  {
    name: 'transferir_para_humano',
    description: 'Transfere o atendimento para um operador humano. Use APENAS quando: (1) o cliente solicitar explicitamente falar com humano, (2) a situação for muito sensível ou complexa, (3) o cliente estiver claramente insatisfeito após tentativas de resolver, (4) a solicitação envolver cancelamento ou reembolso.',
    input_schema: {
      type: 'object',
      properties: {
        motivo: { type: 'string', description: 'Motivo da transferência para o operador' },
        resumo: { type: 'string', description: 'Resumo do que foi discutido até agora para o operador continuar' },
      },
      required: ['motivo'],
    },
  },
]

// ─── Execução das tools ───────────────────────────────────────────────────────

export interface ToolExecutionContext {
  workspaceId: string
  agentId: string
  contactPhone?: string
  contactName?: string
}

export async function executeTool(
  toolName: string,
  toolInput: Record<string, any>,
  ctx: ToolExecutionContext
): Promise<string> {
  logger.info('Agent tool called', { toolName, workspaceId: ctx.workspaceId, agentId: ctx.agentId })

  try {
    if (toolName === 'consultar_pedido') return await toolConsultarPedido(toolInput, ctx)
    if (toolName === 'gerar_link_pagamento') return await toolGerarLinkPagamento(toolInput, ctx)
    if (toolName === 'agendar_horario') return await toolAgendarHorario(toolInput, ctx)
    if (toolName === 'criar_lead') return await toolCriarLead(toolInput, ctx)
    if (toolName === 'verificar_estoque') return await toolVerificarEstoque(toolInput, ctx)
    if (toolName === 'transferir_para_humano') return await toolTransferirHumano(toolInput, ctx)
    return `Ferramenta ${toolName} não reconhecida.`
  } catch (err: any) {
    logger.error('Tool execution error', { toolName, err: err.message })
    return `Não foi possível executar a ação no momento. Tente novamente em alguns instantes.`
  }
}

// ─── Tool: Consultar Pedido ───────────────────────────────────────────────────

async function toolConsultarPedido(input: Record<string, any>, ctx: ToolExecutionContext): Promise<string> {
  const { numero_pedido, telefone_cliente } = input
  const phone = telefone_cliente ?? ctx.contactPhone

  // Busca integração Nuvemshop ou Shopify ativa no workspace
  const integration = await prisma.integration.findFirst({
    where: {
      workspaceId: ctx.workspaceId,
      platform: { in: ['nuvemshop', 'shopify', 'mercadolivre'] },
      status: 'active',
    },
  })

  if (!integration) {
    return 'Não consegui acessar o sistema de pedidos no momento. Por favor, consulte diretamente no site ou entre em contato com nossa equipe.'
  }

  if (integration.platform === 'nuvemshop' && integration.accessToken && integration.shopId) {
    const token = decrypt(integration.accessToken)
    const shopId = integration.shopId

    // Busca por número do pedido se informado
    if (numero_pedido) {
      const res = await fetch(`https://api.nuvemshop.com.br/v1/${shopId}/orders?q=${numero_pedido}`, {
        headers: { Authentication: `bearer ${token}`, 'User-Agent': 'SyncroFlow/1.0' },
      })
      if (res.ok) {
        const orders = await res.json() as any[]
        if (orders.length > 0) {
          const o = orders[0]
          const status = mapNuvemshopStatus(o.payment_status, o.shipping_status)
          return `Pedido #${o.number}: ${status}. Valor: R$ ${o.total}. ${o.shipping_tracking_number ? `Código de rastreio: ${o.shipping_tracking_number}` : 'Ainda sem código de rastreio.'}`
        }
        return `Pedido ${numero_pedido} não encontrado. Verifique o número e tente novamente.`
      }
    }

    // Busca por telefone
    if (phone) {
      const cleanPhone = phone.replace(/\D/g, '')
      const res = await fetch(`https://api.nuvemshop.com.br/v1/${shopId}/orders?per_page=5&sort_by=created_at&sort_direction=desc`, {
        headers: { Authentication: `bearer ${token}`, 'User-Agent': 'SyncroFlow/1.0' },
      })
      if (res.ok) {
        const orders = await res.json() as any[]
        const match = orders.find((o: any) => {
          const orderPhone = (o.customer?.phone ?? '').replace(/\D/g, '')
          return orderPhone && orderPhone.endsWith(cleanPhone.slice(-8))
        })
        if (match) {
          const status = mapNuvemshopStatus(match.payment_status, match.shipping_status)
          return `Último pedido #${match.number}: ${status}. Valor: R$ ${match.total}. ${match.shipping_tracking_number ? `Código de rastreio: ${match.shipping_tracking_number}` : 'Ainda sem código de rastreio.'}`
        }
      }
    }
  }

  return 'Não encontrei pedidos com essas informações. Por favor, informe o número do pedido para que eu possa verificar.'
}

function mapNuvemshopStatus(paymentStatus: string, shippingStatus: string): string {
  if (paymentStatus === 'pending') return 'aguardando pagamento'
  if (paymentStatus === 'voided' || paymentStatus === 'refunded') return 'cancelado/reembolsado'
  if (shippingStatus === 'shipped') return 'enviado — em trânsito'
  if (shippingStatus === 'delivered') return 'entregue'
  if (paymentStatus === 'paid') return 'pago e em preparação'
  return `status: ${paymentStatus} / ${shippingStatus}`
}

// ─── Tool: Gerar Link de Pagamento ───────────────────────────────────────────

async function toolGerarLinkPagamento(input: Record<string, any>, ctx: ToolExecutionContext): Promise<string> {
  const conn = await prisma.financeConnection.findFirst({
    where: { workspaceId: ctx.workspaceId, status: 'active' },
  })

  if (!conn?.apiKey) {
    return 'O sistema de pagamento não está configurado neste momento. Por favor, entre em contato com nossa equipe para receber os dados de pagamento.'
  }

  const apiKey = decrypt(conn.apiKey)

  if (conn.platform === 'asaas') {
    const isProduction = apiKey.startsWith('$aact_')
    const host = isProduction ? 'https://api.asaas.com' : 'https://sandbox.asaas.com'

    // Criar ou buscar cliente
    let customerId: string | null = null
    if (input.cpf_cnpj) {
      const searchRes = await fetch(`${host}/api/v3/customers?cpfCnpj=${input.cpf_cnpj.replace(/\D/g, '')}`, {
        headers: { access_token: apiKey },
      })
      const searchData = await searchRes.json() as any
      customerId = searchData?.data?.[0]?.id ?? null
    }

    if (!customerId) {
      const createRes = await fetch(`${host}/api/v3/customers`, {
        method: 'POST',
        headers: { access_token: apiKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: input.nome_cliente, email: input.email_cliente, cpfCnpj: input.cpf_cnpj?.replace(/\D/g, '') }),
      })
      const created = await createRes.json() as any
      customerId = created?.id ?? null
    }

    if (!customerId) return 'Não foi possível identificar o cliente no sistema de pagamento.'

    const chargeRes = await fetch(`${host}/api/v3/payments`, {
      method: 'POST',
      headers: { access_token: apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        customer: customerId,
        billingType: 'PIX',
        value: input.valor,
        dueDate: new Date(Date.now() + 86400000).toISOString().split('T')[0],
        description: input.descricao,
      }),
    })
    const charge = await chargeRes.json() as any

    if (charge?.invoiceUrl) {
      return `Link de pagamento PIX gerado com sucesso! Valor: R$ ${input.valor.toFixed(2)}. Acesse: ${charge.invoiceUrl} (válido por 24 horas)`
    }
    return 'Não foi possível gerar o link de pagamento. Nossa equipe entrará em contato.'
  }

  return 'Sistema de pagamento não disponível no momento.'
}

// ─── Tool: Agendar Horário ────────────────────────────────────────────────────

async function toolAgendarHorario(input: Record<string, any>, ctx: ToolExecutionContext): Promise<string> {
  const workspace = await prisma.workspace.findUnique({
    where: { id: ctx.workspaceId },
    select: { googleCalendarEnabled: true, googleCalendarId: true, googleAccessToken: true, googleRefreshToken: true, googleTokenExpiry: true },
  })

  if (!workspace?.googleCalendarEnabled || !workspace.googleCalendarId) {
    // Sem Google Calendar, criar um lead com a solicitação de agendamento
    await prisma.lead.create({
      data: {
        workspaceId: ctx.workspaceId,
        name: input.nome_cliente,
        phone: input.telefone ?? ctx.contactPhone ?? '',
        source: 'Agente IA',
        notes: `Solicita agendamento: ${input.servico}. Data preferida: ${input.data_preferida ?? 'a combinar'}. Horário preferido: ${input.horario_preferido ?? 'a combinar'}.`,
        tags: ['agendamento-solicitado'],
      },
    })
    return `Anotei sua solicitação de agendamento para ${input.servico}! Nossa equipe entrará em contato em breve para confirmar ${input.data_preferida ? `a disponibilidade na ${input.data_preferida}` : 'o melhor horário para você'}.`
  }

  // Com Google Calendar — criar evento
  try {
    // Google Calendar disponível — cria evento via createCalendarEvent do lib
    const { createCalendarEvent } = await import('../../lib/google')
    const { getValidToken } = await import('../../lib/google')
    const accessToken = await getValidToken(ctx.workspaceId)
    if (accessToken) {
      const startDt = new Date(Date.now() + 86400000).toISOString()
      await createCalendarEvent(accessToken, workspace.googleCalendarId!, {
        summary: `${input.servico} — ${input.nome_cliente}`,
        description: `Agendamento via agente IA. Telefone: ${input.telefone ?? ctx.contactPhone ?? 'não informado'}`,
        start: { dateTime: startDt, timeZone: 'America/Sao_Paulo' },
        end: { dateTime: startDt, timeZone: 'America/Sao_Paulo' },
      })
      return `Agendamento registrado! ${input.servico} para ${input.nome_cliente}. Nossa equipe confirmará o horário exato com você em breve.`
    }
  } catch {
    // Fallback — cria lead
  }

  await prisma.lead.create({
    data: {
      workspaceId: ctx.workspaceId,
      name: input.nome_cliente,
      phone: input.telefone ?? ctx.contactPhone ?? '',
      source: 'Agente IA',
      notes: `Solicita agendamento: ${input.servico}. Preferência: ${input.data_preferida ?? ''} ${input.horario_preferido ?? ''}.`,
      tags: ['agendamento-solicitado'],
    },
  })

  return `Recebi sua solicitação! ${input.servico} para ${input.nome_cliente}. Nossa equipe confirmará o agendamento em breve via WhatsApp.`
}

// ─── Tool: Criar Lead ─────────────────────────────────────────────────────────

async function toolCriarLead(input: Record<string, any>, ctx: ToolExecutionContext): Promise<string> {
  const existing = await prisma.lead.findFirst({
    where: { workspaceId: ctx.workspaceId, phone: input.telefone },
  })

  if (existing) {
    await prisma.lead.update({
      where: { id: existing.id },
      data: {
        notes: existing.notes ? `${existing.notes}\n[Atualizado pelo agente IA] ${input.observacoes ?? ''}` : input.observacoes,
      },
    })
    return `Já tenho seu cadastro aqui! Atualizei suas informações. Em breve nossa equipe de vendas entrará em contato sobre ${input.interesse ?? 'seu interesse'}.`
  }

  await prisma.lead.create({
    data: {
      workspaceId: ctx.workspaceId,
      name: input.nome,
      phone: input.telefone,
      email: input.email,
      source: 'Agente IA — WhatsApp',
      notes: input.observacoes ?? `Interesse em: ${input.interesse ?? 'não especificado'}`,
      tags: ['agente-ia', 'whatsapp'],
      agentId: ctx.agentId,
    },
  })

  return `Perfeito, ${input.nome}! Registrei seus dados. Nossa equipe de vendas entrará em contato em breve sobre ${input.interesse ?? 'seu interesse'}. Obrigado!`
}

// ─── Tool: Verificar Estoque ──────────────────────────────────────────────────

async function toolVerificarEstoque(input: Record<string, any>, ctx: ToolExecutionContext): Promise<string> {
  const integration = await prisma.integration.findFirst({
    where: {
      workspaceId: ctx.workspaceId,
      platform: { in: ['nuvemshop', 'shopify'] },
      status: 'active',
    },
  })

  if (!integration?.accessToken || !integration.shopId) {
    return `Não tenho acesso direto ao estoque agora. Para verificar a disponibilidade de "${input.nome_produto}", entre em contato com nossa equipe ou acesse nosso site.`
  }

  if (integration.platform === 'nuvemshop') {
    const token = decrypt(integration.accessToken)
    const shopId = integration.shopId

    const res = await fetch(
      `https://api.nuvemshop.com.br/v1/${shopId}/products?q=${encodeURIComponent(input.nome_produto)}&per_page=5`,
      { headers: { Authentication: `bearer ${token}`, 'User-Agent': 'SyncroFlow/1.0' } }
    )

    if (res.ok) {
      const products = await res.json() as any[]
      if (products.length === 0) {
        return `Não encontrei "${input.nome_produto}" no nosso catálogo. Pode tentar outro nome ou entrar em contato com nossa equipe?`
      }

      const product = products[0]
      const variants = product.variants ?? []
      const available = variants.filter((v: any) => v.stock > 0)

      if (available.length === 0) {
        return `Infelizmente "${product.name?.pt ?? product.name}" está sem estoque no momento. Posso anotar seu interesse e avisar quando chegar?`
      }

      if (variants.length === 1) {
        return `"${product.name?.pt ?? product.name}" está disponível! Temos ${available[0].stock} unidade(s) em estoque. Quer saber mais ou já finalizar a compra?`
      }

      const variantInfo = available.slice(0, 3).map((v: any) => `${v.values?.join('/')}: ${v.stock} un.`).join(', ')
      return `"${product.name?.pt ?? product.name}" está disponível! Variações com estoque: ${variantInfo}.`
    }
  }

  return `Vou verificar a disponibilidade de "${input.nome_produto}" para você. Um momento!`
}

// ─── Tool: Transferir para Humano ─────────────────────────────────────────────

async function toolTransferirHumano(input: Record<string, any>, ctx: ToolExecutionContext): Promise<string> {
  // Atualiza a conversa para WAITING_HUMAN
  const conversation = await prisma.conversation.findFirst({
    where: { workspaceId: ctx.workspaceId, agentId: ctx.agentId, status: 'AI_ACTIVE' },
    orderBy: { createdAt: 'desc' },
  })

  if (conversation) {
    await prisma.conversation.update({
      where: { id: conversation.id },
      data: {
        status: 'WAITING_HUMAN',
        transferSummary: input.resumo ?? input.motivo,
      },
    })
  }

  return `Entendido! Estou transferindo você para um de nossos atendentes agora. ${input.resumo ? `Já passei o contexto: "${input.resumo}".` : ''} Aguarde um momento, nossa equipe estará com você em breve! 🙋`
}

// ─── Motor principal: LLM com Tool Use ───────────────────────────────────────

export async function processAgentWithTools(opts: {
  agent: { id: string; llmModel: string; config?: any }
  systemPrompt: string
  conversationHistory: { role: 'user' | 'assistant'; content: string }[]
  userMessage: string
  ctx: ToolExecutionContext
  enabledTools?: string[]
}): Promise<{ content: string; creditsUsed: number; toolsUsed: string[] }> {
  const { agent, systemPrompt, conversationHistory, userMessage, ctx, enabledTools } = opts

  const model = agent.llmModel?.startsWith('claude') ? agent.llmModel : 'claude-haiku-4-5'

  // Filtra tools habilitadas para este agente
  const tools = enabledTools
    ? AGENT_TOOLS.filter(t => enabledTools.includes(t.name))
    : AGENT_TOOLS

  const messages: Anthropic.MessageParam[] = [
    ...conversationHistory.map(m => ({ role: m.role, content: m.content })),
    { role: 'user', content: userMessage },
  ]

  let totalInputTokens = 0
  let totalOutputTokens = 0
  const toolsUsed: string[] = []
  let finalContent = ''

  // Loop de tool use (máximo 5 iterações para evitar loop infinito)
  for (let iteration = 0; iteration < 5; iteration++) {
    const response = await anthropic.messages.create({
      model,
      max_tokens: 2048,
      system: systemPrompt,
      tools: tools.length > 0 ? tools : undefined,
      messages,
    })

    totalInputTokens += response.usage.input_tokens
    totalOutputTokens += response.usage.output_tokens

    if (response.stop_reason === 'end_turn') {
      // Resposta final — sem tool use
      const textBlock = response.content.find(b => b.type === 'text')
      finalContent = textBlock?.type === 'text' ? textBlock.text : ''
      break
    }

    if (response.stop_reason === 'tool_use') {
      const toolUseBlocks = response.content.filter(b => b.type === 'tool_use')

      // Adiciona a resposta do assistente (com tool_use) ao histórico
      messages.push({ role: 'assistant', content: response.content as any })

      // Executa todas as tools chamadas
      const toolResults: Anthropic.ToolResultBlockParam[] = []
      for (const block of toolUseBlocks) {
        if (block.type !== 'tool_use') continue
        toolsUsed.push(block.name)
        const result = await executeTool(block.name, block.input as Record<string, any>, ctx)
        toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: result })
      }

      // Adiciona os resultados das tools ao histórico
      messages.push({ role: 'user', content: toolResults })
      continue
    }

    // stop_reason diferente — pega o que tiver de texto
    const textBlock = response.content.find(b => b.type === 'text')
    finalContent = textBlock?.type === 'text' ? textBlock.text : ''
    break
  }

  const creditsUsed = Math.ceil(((totalInputTokens + totalOutputTokens) / 750) * (model.includes('opus') ? 10 : model.includes('sonnet') ? 3 : 1))

  return { content: finalContent, creditsUsed, toolsUsed }
}
