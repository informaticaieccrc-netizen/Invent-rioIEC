ALTER TABLE public.maquinas
  ADD COLUMN IF NOT EXISTS checklist_ultima_id uuid,
  ADD COLUMN IF NOT EXISTS checklist_tecnico_id uuid,
  ADD COLUMN IF NOT EXISTS checklist_revisor_id uuid,
  ADD COLUMN IF NOT EXISTS checklist_revisado_em timestamptz;

ALTER TABLE public.impressoras
  ADD COLUMN IF NOT EXISTS checklist_ultima_id uuid,
  ADD COLUMN IF NOT EXISTS checklist_tecnico_id uuid,
  ADD COLUMN IF NOT EXISTS checklist_revisor_id uuid,
  ADD COLUMN IF NOT EXISTS checklist_revisado_em timestamptz;

ALTER TABLE public.ramais
  ADD COLUMN IF NOT EXISTS checklist_ultima_id uuid,
  ADD COLUMN IF NOT EXISTS checklist_tecnico_id uuid,
  ADD COLUMN IF NOT EXISTS checklist_revisor_id uuid,
  ADD COLUMN IF NOT EXISTS checklist_revisado_em timestamptz;

ALTER TABLE public.racks
  ADD COLUMN IF NOT EXISTS checklist_ultima_id uuid,
  ADD COLUMN IF NOT EXISTS checklist_tecnico_id uuid,
  ADD COLUMN IF NOT EXISTS checklist_revisor_id uuid,
  ADD COLUMN IF NOT EXISTS checklist_validado_em timestamptz;

CREATE TABLE IF NOT EXISTS public.checklists_validacao (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  nome text NOT NULL,
  localidade_id uuid NOT NULL REFERENCES public.localidades(id),
  incluir_racks boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'aberto',
  data_inicio date,
  data_fim date,
  criado_por uuid REFERENCES public.usuarios(id),
  criado_em timestamptz DEFAULT now(),
  atualizado_em timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.checklists_validacao_solicitacoes (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  checklist_validacao_id uuid NOT NULL REFERENCES public.checklists_validacao(id) ON DELETE CASCADE,
  tipo_solicitacao text NOT NULL,
  setor_id uuid REFERENCES public.setores(id),
  rack_id uuid REFERENCES public.racks(id),
  status text NOT NULL DEFAULT 'aberta',
  assumido_por uuid REFERENCES public.usuarios(id),
  assumido_em timestamptz,
  finalizado_em timestamptz,
  revisado_por uuid REFERENCES public.usuarios(id),
  revisado_em timestamptz,
  status_revisao text NOT NULL DEFAULT 'pendente',
  planner_task_id text,
  planner_status text NOT NULL DEFAULT 'pendente',
  planner_atualizado_em timestamptz,
  csc_numero text,
  csc_criado_em timestamptz,
  csc_atualizado_em timestamptz,
  link_inventario text,
  comentarios jsonb DEFAULT '[]'::jsonb,
  criado_em timestamptz DEFAULT now(),
  atualizado_em timestamptz DEFAULT now(),
  CONSTRAINT check_checklist_solicitacao_tipo
    CHECK (tipo_solicitacao IN ('SETOR', 'RACK')),
  CONSTRAINT check_checklist_solicitacao_alvo
    CHECK (
      (tipo_solicitacao = 'SETOR' AND setor_id IS NOT NULL AND rack_id IS NULL)
      OR
      (tipo_solicitacao = 'RACK' AND rack_id IS NOT NULL AND setor_id IS NULL)
    )
);

CREATE TABLE IF NOT EXISTS public.checklists_validacao_itens (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  checklist_validacao_solicitacao_id uuid NOT NULL REFERENCES public.checklists_validacao_solicitacoes(id) ON DELETE CASCADE,
  tipo_item text NOT NULL,
  referencia_id uuid,
  identificador_informado text,
  dados_informados_json jsonb,
  status_revisao text NOT NULL DEFAULT 'pendente',
  preenchido_por uuid REFERENCES public.usuarios(id),
  preenchido_em timestamptz,
  revisado_por uuid REFERENCES public.usuarios(id),
  revisado_em timestamptz,
  criado_em timestamptz DEFAULT now(),
  atualizado_em timestamptz DEFAULT now(),
  CONSTRAINT check_checklist_item_tipo
    CHECK (tipo_item IN ('MAQUINA', 'RAMAL', 'MONITOR', 'IMPRESSORA'))
);

CREATE TABLE IF NOT EXISTS public.checklists_validacao_diffs (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  checklist_validacao_item_id uuid NOT NULL REFERENCES public.checklists_validacao_itens(id) ON DELETE CASCADE,
  checklist_validacao_solicitacao_id uuid NOT NULL REFERENCES public.checklists_validacao_solicitacoes(id) ON DELETE CASCADE,
  campo text NOT NULL,
  valor_atual jsonb,
  valor_informado jsonb,
  tipo_diff text NOT NULL,
  status_revisao text NOT NULL DEFAULT 'pendente',
  criado_em timestamptz DEFAULT now(),
  atualizado_em timestamptz DEFAULT now(),
  CONSTRAINT check_checklist_diff_tipo
    CHECK (tipo_diff IN ('sem_divergencia', 'alterado', 'novo', 'ausente', 'vinculo_divergente'))
);

CREATE TABLE IF NOT EXISTS public.checklists_validacao_racks_respostas (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  checklist_validacao_solicitacao_id uuid NOT NULL REFERENCES public.checklists_validacao_solicitacoes(id) ON DELETE CASCADE,
  rack_id uuid NOT NULL,
  dados_informados_json jsonb,
  observacoes text,
  preenchido_por uuid,
  preenchido_em timestamptz,
  criado_em timestamptz DEFAULT now(),
  atualizado_em timestamptz DEFAULT now(),
  CONSTRAINT checklists_validacao_racks_respostas_checklist_validacao_so_key UNIQUE (checklist_validacao_solicitacao_id),
  CONSTRAINT checklists_validacao_racks_respostas_rack_id_fkey
    FOREIGN KEY (rack_id) REFERENCES public.racks(id) ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT checklists_validacao_racks_respostas_preenchido_por_fkey
    FOREIGN KEY (preenchido_por) REFERENCES public.usuarios(id) ON DELETE SET NULL ON UPDATE NO ACTION
);

CREATE TABLE IF NOT EXISTS public.monitores (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  codigo_interno text UNIQUE,
  patrimonio text UNIQUE,
  serial text,
  marca text,
  modelo text,
  status text NOT NULL DEFAULT 'ativo',
  criado_via_checklist boolean NOT NULL DEFAULT false,
  criado_por uuid,
  criado_em timestamptz DEFAULT now(),
  atualizado_em timestamptz DEFAULT now(),
  checklist_ultima_id uuid,
  checklist_tecnico_id uuid,
  checklist_revisor_id uuid,
  checklist_revisado_em timestamptz,
  CONSTRAINT monitores_criado_por_fkey
    FOREIGN KEY (criado_por) REFERENCES public.usuarios(id) ON DELETE SET NULL ON UPDATE NO ACTION
);

CREATE TABLE IF NOT EXISTS public.alocacoes_monitores (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  monitor_id uuid NOT NULL REFERENCES public.monitores(id) ON DELETE CASCADE,
  maquina_id uuid,
  setor_id uuid,
  data_inicio date,
  data_fim date,
  ativo boolean NOT NULL DEFAULT true,
  criado_por uuid,
  criado_em timestamptz DEFAULT now(),
  atualizado_em timestamptz DEFAULT now(),
  CONSTRAINT alocacoes_monitores_maquina_id_fkey
    FOREIGN KEY (maquina_id) REFERENCES public.maquinas(id) ON DELETE SET NULL ON UPDATE NO ACTION,
  CONSTRAINT alocacoes_monitores_setor_id_fkey
    FOREIGN KEY (setor_id) REFERENCES public.setores(id) ON DELETE SET NULL ON UPDATE NO ACTION,
  CONSTRAINT alocacoes_monitores_criado_por_fkey
    FOREIGN KEY (criado_por) REFERENCES public.usuarios(id) ON DELETE SET NULL ON UPDATE NO ACTION
);

CREATE INDEX IF NOT EXISTS idx_checklists_validacao_localidade ON public.checklists_validacao(localidade_id);
CREATE INDEX IF NOT EXISTS idx_checklists_validacao_status ON public.checklists_validacao(status);
CREATE INDEX IF NOT EXISTS idx_checklists_validacao_criado_em ON public.checklists_validacao(criado_em DESC);
CREATE INDEX IF NOT EXISTS idx_checklist_solicitacoes_checklist ON public.checklists_validacao_solicitacoes(checklist_validacao_id);
CREATE INDEX IF NOT EXISTS idx_checklist_solicitacoes_status ON public.checklists_validacao_solicitacoes(status);
CREATE INDEX IF NOT EXISTS idx_checklist_solicitacoes_planner_status ON public.checklists_validacao_solicitacoes(planner_status);
CREATE INDEX IF NOT EXISTS idx_checklist_itens_solicitacao ON public.checklists_validacao_itens(checklist_validacao_solicitacao_id);
CREATE INDEX IF NOT EXISTS idx_checklist_itens_tipo ON public.checklists_validacao_itens(tipo_item);
CREATE INDEX IF NOT EXISTS idx_checklist_itens_referencia ON public.checklists_validacao_itens(referencia_id);
CREATE INDEX IF NOT EXISTS idx_checklist_diffs_item ON public.checklists_validacao_diffs(checklist_validacao_item_id);
CREATE INDEX IF NOT EXISTS idx_checklist_diffs_solicitacao ON public.checklists_validacao_diffs(checklist_validacao_solicitacao_id);
CREATE INDEX IF NOT EXISTS idx_checklist_diffs_status ON public.checklists_validacao_diffs(status_revisao);
CREATE INDEX IF NOT EXISTS idx_checklist_rack_respostas_rack ON public.checklists_validacao_racks_respostas(rack_id);
CREATE INDEX IF NOT EXISTS idx_monitores_serial ON public.monitores(serial);
CREATE INDEX IF NOT EXISTS idx_monitores_status ON public.monitores(status);
CREATE INDEX IF NOT EXISTS idx_alocacoes_monitores_monitor ON public.alocacoes_monitores(monitor_id);
CREATE INDEX IF NOT EXISTS idx_alocacoes_monitores_maquina ON public.alocacoes_monitores(maquina_id);
CREATE INDEX IF NOT EXISTS idx_alocacoes_monitores_setor ON public.alocacoes_monitores(setor_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_alocacoes_monitores_monitor_ativo
  ON public.alocacoes_monitores(monitor_id)
  WHERE ativo = true;
