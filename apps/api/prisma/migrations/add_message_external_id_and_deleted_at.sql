-- Adiciona externalId (wamid da Meta) e deletedAt (soft-delete) ao Message,
-- para suportar excluir mensagens do chat (local sempre, remoto na Meta
-- quando o wamid existir e estiver dentro da janela de tempo permitida).
ALTER TABLE "Message" ADD COLUMN IF NOT EXISTS "externalId" TEXT;
ALTER TABLE "Message" ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);
