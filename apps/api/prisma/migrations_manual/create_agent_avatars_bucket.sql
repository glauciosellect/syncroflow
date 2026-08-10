-- Bucket de Storage para avatar/logo dos agentes de IA
-- Público: a URL é usada direto em <img src> no painel, sem passar pelo backend.
-- Rodar no SQL Editor do Supabase (projeto SyncroFlow).

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'agent-avatars',
  'agent-avatars',
  true,
  5242880, -- 5MB
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Bucket público: leitura livre para qualquer um com a URL (necessário para
-- exibir o avatar no painel). Upload/delete continuam restritos à service_role
-- key usada pelo backend — não criamos policy de insert/update/delete público.
