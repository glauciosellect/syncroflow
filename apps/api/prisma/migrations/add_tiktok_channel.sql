-- Adiciona TIKTOK ao enum ChannelType (rodar no Supabase ANTES do deploy do código)
DO $$ BEGIN
  ALTER TYPE "ChannelType" ADD VALUE IF NOT EXISTS 'TIKTOK';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
