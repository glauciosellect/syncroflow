-- Adiciona campo ttsVoice na tabela AgentConfig
-- Valor padrão: 'onyx' (voz masculina grave — mesma voz que já era usada)
ALTER TABLE "AgentConfig" ADD COLUMN IF NOT EXISTS "ttsVoice" TEXT NOT NULL DEFAULT 'onyx';
