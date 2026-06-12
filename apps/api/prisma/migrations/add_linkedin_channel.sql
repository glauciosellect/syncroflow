-- Adiciona LINKEDIN ao enum ChannelType
DO $$ BEGIN
  ALTER TYPE "ChannelType" ADD VALUE IF NOT EXISTS 'LINKEDIN';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
