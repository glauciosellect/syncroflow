-- Busca por nome ignorando acento (ex.: digitar "joao" deve achar "João") —
-- sem isso, a busca de conversas/contatos só batia com o acento exato.
CREATE EXTENSION IF NOT EXISTS unaccent SCHEMA extensions;
