-- Cria a intenção padrão "Falar com a equipe" (ação Transferir para equipe) em todo agente ativo que ainda não tem uma.
-- Rode DEPOIS de add_intention_human_transfer.sql (o valor novo do enum precisa estar confirmado antes).
-- Pode rodar mais de uma vez: não duplica.
INSERT INTO "Intention" ("id", "agentId", "name", "description", "actionType", "responseMode", "webhookMethod", "webhookBody", "isActive", "createdAt", "updatedAt")
SELECT
  gen_random_uuid()::text,
  a."id",
  'Falar com a equipe',
  'quero falar com uma pessoa, quero falar com um humano, quero falar com um atendente, passa para um atendente, quero falar com o responsável, quero falar com o advogado, quero falar com a advogada, preciso de atendimento humano, não quero falar com robô, chama alguém da equipe, quero que alguém me ligue',
  'HUMAN_TRANSFER',
  'FIXED_MESSAGE',
  'POST',
  '{"fixedMessage":"Certo! Já avisei nossa equipe e em breve um atendente fala com você por aqui. 🙏"}'::jsonb,
  true,
  now(),
  now()
FROM "Agent" a
WHERE a."isActive" = true
  AND NOT EXISTS (
    SELECT 1 FROM "Intention" i WHERE i."agentId" = a."id" AND i."actionType" = 'HUMAN_TRANSFER'
  );
