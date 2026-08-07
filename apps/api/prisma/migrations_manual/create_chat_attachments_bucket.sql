-- Bucket de Storage para anexos do Chat (imagens, PDF, docs, audio)
-- Privado: acesso só via service role (backend), nunca direto do navegador.
-- Rodar no SQL Editor do Supabase (projeto SyncroFlow).

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'chat-attachments',
  'chat-attachments',
  false,
  26214400, -- 25MB, acima do limite de 16MB da Meta para dar folga em compressao/conversao
  array[
    'image/jpeg', 'image/png', 'image/webp', 'image/gif',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'audio/mpeg', 'audio/ogg', 'audio/mp4', 'audio/aac', 'audio/amr', 'audio/webm'
  ]
)
on conflict (id) do update set
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Nenhuma policy de acesso publico é criada de propósito — o bucket é privado
-- e todo acesso (upload/leitura) passa pelo backend usando a service_role key,
-- que ignora RLS. Isso evita expor documentos de clientes via URL direta.
