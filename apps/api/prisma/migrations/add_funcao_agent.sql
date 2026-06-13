-- Migration: adicionar campo funcao no Agent
ALTER TABLE "Agent" ADD COLUMN IF NOT EXISTS "funcao" TEXT;
