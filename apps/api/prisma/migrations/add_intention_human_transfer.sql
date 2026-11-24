-- Nova ação de intenção: "Transferir para equipe (humano)".
-- Rode no SQL Editor do Supabase ANTES de subir o código. Pode rodar mais de uma vez.
ALTER TYPE "IntentionAction" ADD VALUE IF NOT EXISTS 'HUMAN_TRANSFER';
