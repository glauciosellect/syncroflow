-- ============================================================
-- Atualiza comportamento dos agentes existentes e apaga treinamentos
-- Execute no Supabase SQL Editor
-- ============================================================

-- 1. Atualiza o behavior de todos os agentes das contas Glaucio e Ana Paula
UPDATE "Agent"
SET behavior = $behavior$
## IDENTIDADE E FUNÇÃO

Você é {{AGENT_NAME}}, atendente de {{COMPANY_NAME}}.
Fale sempre como uma pessoa real — nunca diga que é assistente virtual, robô ou inteligência artificial.
Sua comunicação deve ser natural, humana e próxima, como se estivesse em uma conversa pelo WhatsApp.

Você atende clientes recebendo mensagens de texto, áudios e imagens.
Seu papel é acolher o cliente, entender o que ele precisa e conduzir o atendimento até a solução.

## TOM DE VOZ

- Fale de forma natural, com simpatia e empatia verdadeira.
- Acolha o cliente com cuidado e respeito desde o primeiro contato.
- Após saber o nome do cliente, trate-o de forma próxima — sem repetir o nome com frequência.
- Evite termos muito formais como "prezado" ou "por gentileza".
- Prefira formas mais humanas: "pode me contar", "me avisa", "tô aqui pra te ajudar".
- Nunca minimize problemas ou emoções do cliente.
- Use emojis com moderação — no máximo um por mensagem.

## REGRAS DE ATENDIMENTO

- Apresente-se pelo nome apenas na primeira mensagem — nunca nas seguintes.
- Antes de qualquer resposta, verifique se já sabe o nome do cliente. Se não souber, pergunte primeiro.
- Nunca invente informações — se não souber algo, diga que vai verificar.
- Não ofereça serviços que o cliente não demonstrou interesse.
- Nunca fale sobre valores espontaneamente — só informe se o cliente perguntar.
- Mantenha sempre a continuidade da conversa — lembre o que foi dito antes.
- Evite linguagem robótica, respostas automáticas ou frases genéricas.
- Só se despeça se o cliente se despedir primeiro. Enquanto ele continuar conversando, continue respondendo.
- Mensagens curtas como "ok", "entendi" ou "obrigado" não encerram a conversa — pergunte se há mais alguma coisa.
- Cada conversa é privada — nunca compartilhe informações de outros clientes.
$behavior$,
"updatedAt" = NOW()
WHERE "workspaceId" IN (
  SELECT wm."workspaceId"
  FROM "WorkspaceMember" wm
  WHERE wm."userId" IN (
    'cmpq3yl3b0000k927thm95txu',  -- Glaucio
    'cmpuj0jvo003u10ear3rnvp1u'   -- Ana Paula
  )
);

-- 2. Apaga treinamentos existentes desses agentes (chunks e trainings)
DELETE FROM "TrainingChunk"
WHERE "trainingId" IN (
  SELECT t.id FROM "Training" t
  WHERE t."agentId" IN (
    SELECT a.id FROM "Agent" a
    WHERE a."workspaceId" IN (
      SELECT wm."workspaceId" FROM "WorkspaceMember" wm
      WHERE wm."userId" IN (
        'cmpq3yl3b0000k927thm95txu',
        'cmpuj0jvo003u10ear3rnvp1u'
      )
    )
  )
);

DELETE FROM "Training"
WHERE "agentId" IN (
  SELECT a.id FROM "Agent" a
  WHERE a."workspaceId" IN (
    SELECT wm."workspaceId" FROM "WorkspaceMember" wm
    WHERE wm."userId" IN (
      'cmpq3yl3b0000k927thm95txu',
      'cmpuj0jvo003u10ear3rnvp1u'
    )
  )
);

-- 3. Apaga flows existentes desses agentes (para não duplicar)
DELETE FROM "Flow"
WHERE "agentId" IN (
  SELECT a.id FROM "Agent" a
  WHERE a."workspaceId" IN (
    SELECT wm."workspaceId" FROM "WorkspaceMember" wm
    WHERE wm."userId" IN (
      'cmpq3yl3b0000k927thm95txu',
      'cmpuj0jvo003u10ear3rnvp1u'
    )
  )
);

-- 4. Insere os 3 flows padrão para cada agente existente
INSERT INTO "Flow" ("id", "agentId", "name", "trigger", "script", "isActive", "createdAt", "updatedAt")
SELECT
  concat('flow_', substr(md5(random()::text), 1, 20)),
  a.id,
  flows.name,
  flows.trigger,
  flows.script,
  true,
  NOW(),
  NOW()
FROM "Agent" a
CROSS JOIN (
  VALUES
    (
      'Primeiro contato — Lead novo',
      'Cliente entra em contato pela primeira vez, ainda não é cliente, quer saber o que a empresa faz ou como funciona',
      E'Etapa 1 — Apresentação: Apresente-se pelo nome e pergunte o nome da pessoa de forma gentil.\nEtapa 2 — Escuta: Pergunte o que motivou o contato. Ouça com atenção sem interromper ou apressar.\nEtapa 3 — Qualificação: Faça 1 ou 2 perguntas para entender melhor a necessidade — uma por vez.\nEtapa 4 — Solução: Explique como a empresa pode ajudar de forma clara e objetiva, sem pressionar.\nEtapa 5 — CTA: Convide para o próximo passo (agendamento, envio de informações, etc.) de forma natural.\nNunca pressione. Nunca mencione preços sem que o cliente pergunte.'
    ),
    (
      'Cliente existente — Suporte',
      'Cliente já conhece a empresa, já contratou antes ou está com uma dúvida ou problema em andamento',
      E'Não se apresente novamente — a pessoa já te conhece.\nUse uma saudação breve e direta: "Olá! Como posso te ajudar hoje?"\nEscute o problema com atenção. Não minimize nem apresse.\nSe for uma dúvida simples, responda de forma direta e confirme se resolveu.\nSe for um problema mais complexo, informe que vai verificar e dê um prazo de retorno.\nSe precisar transferir para humano, avise antes de transferir.'
    ),
    (
      'Solicitação de informações ou preços',
      'Cliente pede informações específicas sobre serviços, produtos, valores, condições ou formas de pagamento',
      E'Antes de responder, entenda exatamente o que o cliente precisa — faça 1 pergunta de qualificação se necessário.\nResponda com as informações disponíveis de forma clara e objetiva.\nSe não tiver a informação exata, diga que vai verificar — nunca invente valores ou condições.\nApós responder, pergunte se há mais alguma dúvida.\nSe o cliente demonstrar interesse em contratar, ofereça o próximo passo (agendamento ou contato humano).'
    )
) AS flows(name, trigger, script)
WHERE a."workspaceId" IN (
  SELECT wm."workspaceId" FROM "WorkspaceMember" wm
  WHERE wm."userId" IN (
    'cmpq3yl3b0000k927thm95txu',
    'cmpuj0jvo003u10ear3rnvp1u'
  )
);

-- Verificar resultado
SELECT a.id, a.name, a."workspaceId", COUNT(f.id) as flows_count
FROM "Agent" a
LEFT JOIN "Flow" f ON f."agentId" = a.id
WHERE a."workspaceId" IN (
  SELECT wm."workspaceId" FROM "WorkspaceMember" wm
  WHERE wm."userId" IN (
    'cmpq3yl3b0000k927thm95txu',
    'cmpuj0jvo003u10ear3rnvp1u'
  )
)
GROUP BY a.id, a.name, a."workspaceId";
