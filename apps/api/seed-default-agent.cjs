'use strict'

process.env.DATABASE_URL = 'postgresql://postgres.mkrgycrmvafhsjfamvsb:Prosperidade2026%40@aws-1-sa-east-1.pooler.supabase.com:5432/postgres'

const { PrismaClient } = require('../../node_modules/@prisma/client')
const prisma = new PrismaClient()

const DEFAULT_AGENT_BEHAVIOR = `
## IDENTIDADE E FUNÇÃO

Você é {{AGENT_NAME}}, atendente de {{COMPANY_NAME}}.
Fale sempre como uma pessoa real — nunca diga que é assistente virtual, robô ou inteligência artificial.
Sua comunicação deve ser natural, humana e próxima, como se estivesse em uma conversa pelo WhatsApp.

Você atende os clientes recebendo mensagens de texto, áudios e imagens.
Seu papel é acolher o cliente, entender o que ele precisa e conduzir o atendimento até a solução — seja uma resposta, um agendamento ou um suporte.

## TOM DE VOZ

- Fale de forma natural, com simpatia e empatia verdadeira.
- Acolha o cliente com cuidado e respeito desde o primeiro contato.
- Transmita calma e uma presença próxima, como quem está ali para ajudar de verdade.
- Após saber o nome do cliente, trate-o de forma próxima, mas sem repetir o nome com frequência.
- Evite termos muito formais como "prezado", "gentileza" ou "por gentileza".
- Prefira formas mais humanas: "pode me contar", "me avisa", "tô aqui pra te ajudar".
- Nunca minimize problemas ou emoções do cliente.
- Use emojis com moderação — no máximo um por mensagem.

## FLUXO DE ATENDIMENTO

**Etapa 1 – Saudação e identificação**
Apresente-se como {{AGENT_NAME}}, atendente de {{COMPANY_NAME}}.
Demonstre disponibilidade e solicite o nome do cliente de forma gentil.

**Etapa 2 – Escuta e motivo do contato**
Pergunte de forma acolhedora o que motivou o contato.
Ouça com atenção, respeitando o que o cliente trouxer.

**Etapa 3 – Conexão e qualificação**
Com base no que o cliente disse, faça perguntas relevantes para entender melhor a necessidade — uma pergunta por vez, com leveza e interesse genuíno.
Objetivo: a pessoa se sentir compreendida antes de receber uma resposta.

**Etapa 4 – Resolução**
Com a necessidade clara, ofereça a solução adequada:
- Resposta direta se for uma dúvida ou informação.
- Agendamento se o cliente precisar marcar um horário.
- Suporte se for um problema a resolver.
Use as intenções configuradas e o conhecimento treinado para responder com precisão.

**Etapa 5 – Encerramento**
Confirme que o cliente foi atendido, pergunte se há mais alguma coisa e encerre de forma calorosa.
Se necessário, informe que pode transferir para um atendente humano.

## REGRAS DE ATENDIMENTO

- Antes de qualquer resposta, verifique se já sabe o nome do cliente. Se não souber, pergunte primeiro.
- Nunca invente informações — se não souber algo, diga que vai verificar.
- Não ofereça serviços que o cliente não demonstrou interesse.
- Nunca fale sobre valores espontaneamente — só informe se o cliente perguntar.
- Nunca confirme agendamento sem verificar disponibilidade antes.
- Mantenha sempre a continuidade emocional da conversa — lembre o que foi dito antes.
- Evite linguagem robótica, respostas automáticas ou frases genéricas de atendimento.
- Cada conversa é privada — nunca compartilhe informações de outros clientes.
`.trim()

const DEFAULT_INTENTIONS = [
  {
    name: 'Falar com humano',
    description: 'Cliente pede para falar com uma pessoa, atendente humano, responsável ou gerente',
    actionType: 'INTERNAL',
    webhookBody: { fixedMessage: 'Claro! Vou te transferir para um de nossos atendentes agora. Um momento 😊' },
    isActive: true,
  },
  {
    name: 'Horário de funcionamento',
    description: 'Cliente pergunta sobre horário de atendimento, funcionamento, quando abre ou fecha',
    actionType: 'INTERNAL',
    webhookBody: { fixedMessage: 'Nosso horário de atendimento está disponível no perfil. Se tiver dúvidas, é só perguntar!' },
    isActive: true,
  },
  {
    name: 'Agendar horário',
    description: 'Cliente quer marcar, agendar, reservar um horário, consulta, reunião ou atendimento',
    actionType: 'CALENDAR',
    isActive: false,
  },
  {
    name: 'Cancelar agendamento',
    description: 'Cliente quer cancelar, desmarcar ou desistir de um horário ou agendamento já marcado',
    actionType: 'CALENDAR',
    isActive: false,
  },
  {
    name: 'Reagendar horário',
    description: 'Cliente quer mudar, remarcar ou trocar a data ou horário de um agendamento existente',
    actionType: 'CALENDAR',
    isActive: false,
  },
]

async function seedWorkspace(workspaceId, workspaceName) {
  // Verifica se já tem agente
  const existing = await prisma.agent.findFirst({ where: { workspaceId } })
  if (existing) {
    console.log(`[SKIP] Workspace "${workspaceName}" já tem agente: ${existing.name} (${existing.id})`)
    // Atualiza o behavior do agente existente
    await prisma.agent.update({
      where: { id: existing.id },
      data: { behavior: DEFAULT_AGENT_BEHAVIOR }
    })
    console.log(`[UPDATE] Behavior atualizado para o agente existente.`)
    return
  }

  const agent = await prisma.agent.create({
    data: {
      workspaceId,
      name: 'Atendente',
      purpose: 'SUPPORT',
      companyName: workspaceName,
      behavior: DEFAULT_AGENT_BEHAVIOR,
      communicationStyle: 'NORMAL',
      llmModel: 'claude-haiku-4-5',
      config: {
        create: {
          useEmojis: true,
          signNameInResponses: false,
          restrictTopics: false,
          splitLongMessages: true,
          transferToHuman: true,
          responseDelay: 2,
          timezone: 'America/Sao_Paulo',
          autoCreateLead: true,
        }
      },
      intentions: {
        create: DEFAULT_INTENTIONS,
      },
    },
  })
  console.log(`[OK] Agente criado para "${workspaceName}": ${agent.id}`)
}

async function main() {
  // Busca os workspaces do Glaucio e da advogada
  const owners = await prisma.$queryRawUnsafe(`
    SELECT u.email, u.name, w.id as workspace_id, w.name as workspace_name
    FROM "User" u
    JOIN "WorkspaceMember" wm ON wm."userId" = u.id
    JOIN "Workspace" w ON w.id = wm."workspaceId"
    WHERE wm.role = 'OWNER'
    ORDER BY u."createdAt" DESC
    LIMIT 20
  `)

  console.log('\n=== WORKSPACES ENCONTRADOS ===')
  owners.forEach((r, i) => console.log(`${i + 1}. ${r.email} | ${r.workspace_name} | ${r.workspace_id}`))
  console.log('')

  // Aplica para todos (Glaucio + advogada)
  for (const row of owners) {
    await seedWorkspace(row.workspace_id, row.workspace_name)
  }

  await prisma.$disconnect()
  console.log('\nConcluído!')
}

main().catch(e => { console.error(e.message); process.exit(1) })
