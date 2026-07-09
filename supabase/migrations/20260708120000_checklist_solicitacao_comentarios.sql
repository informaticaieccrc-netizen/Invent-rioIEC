ALTER TABLE public.checklists_validacao_solicitacoes
  ADD COLUMN IF NOT EXISTS comentarios jsonb DEFAULT '[]'::jsonb;
