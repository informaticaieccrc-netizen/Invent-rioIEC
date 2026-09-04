-- Encerramento dos setores antigos do CSE
--
-- Complementa 20260904150000_realoca_colaboradores_nucleos_cse.sql, que criou os
-- nucleos e moveu as 70 pessoas da nova relacao.
--
-- Setores antigos alvo: Secretaria Academica, Secretaria Academica VIRTUAL,
-- Estudio e Certificacao. Sao exatamente as quatro origens das 70 pessoas
-- realocadas, e nenhum colaborador ATIVO permaneceu em nenhuma delas.
--
-- Ordem de execucao:
--   1. Equipamento com detentor atual acompanha o dono (recebe o setor do
--      colaborador da alocacao ativa).
--   2. Regra nova: colaborador inativo nao carrega setor. Backfill de todos os
--      inativos + trigger para os proximos.
--   3. O que ainda apontar para os setores antigos passa a NULL.
--   4. Os quatro setores sao apagados, apos guarda que confirma zero referencias.
--
-- ATENCAO, decisoes com perda de informacao (reversiveis apenas por dump):
--   - O backfill do passo 2 limpa o setor de TODOS os colaboradores inativos,
--     nao apenas dos 16 que estavam nos setores antigos. E o que torna a regra
--     do trigger consistente com os dados existentes.
--   - Solicitacoes de checklist que apontavam para os setores antigos perdem
--     essa referencia (passam a NULL). E historico de solicitacao, nao de
--     inventario.
--   Cada passo emite NOTICE com a contagem afetada, entao o log da homologacao
--   mostra exatamente o que foi tocado.

BEGIN;

-- ---------------------------------------------------------------------------
-- 0. Alvo
-- ---------------------------------------------------------------------------
CREATE TEMP TABLE _setores_antigos ON COMMIT DROP AS
SELECT id, nome
FROM public.setores
WHERE nome IN (
  'Secretaria Acadêmica',
  'Secretaria Acadêmica VIRTUAL',
  'Estúdio',
  'Certificação'
);

DO $$
DECLARE alvo integer;
BEGIN
  SELECT count(*) INTO alvo FROM _setores_antigos;
  RAISE NOTICE 'Setores antigos encontrados nesta base: %', alvo;
END $$;

-- ---------------------------------------------------------------------------
-- 1. Equipamento acompanha o detentor atual
--    DISTINCT ON garante uma alocacao por item mesmo se houver mais de uma
--    marcada como ativa (a mais recente vence).
-- ---------------------------------------------------------------------------
UPDATE public.maquinas m
SET setor_id = a.setor_id
FROM (
  SELECT DISTINCT ON (al.maquina_id)
         al.maquina_id AS item_id, c.setor_id
  FROM public.alocacoes_maquinas al
  JOIN public.colaboradores c ON c.id = al.colaborador_id
  WHERE al.ativo IS TRUE AND al.maquina_id IS NOT NULL
  ORDER BY al.maquina_id, al.data_inicio DESC NULLS LAST
) a
WHERE m.id = a.item_id
  AND m.setor_id IN (SELECT id FROM _setores_antigos);

UPDATE public.notebooks n
SET setor_id = a.setor_id
FROM (
  SELECT DISTINCT ON (al.notebook_id)
         al.notebook_id AS item_id, c.setor_id
  FROM public.alocacoes_notebooks al
  JOIN public.colaboradores c ON c.id = al.colaborador_id
  WHERE al.ativo IS TRUE AND al.notebook_id IS NOT NULL
  ORDER BY al.notebook_id, al.data_inicio DESC NULLS LAST
) a
WHERE n.id = a.item_id
  AND n.setor_id IN (SELECT id FROM _setores_antigos);

UPDATE public.aparelhos ap
SET setor_id = a.setor_id
FROM (
  SELECT DISTINCT ON (al.aparelho_id)
         al.aparelho_id AS item_id, c.setor_id
  FROM public.alocacoes_aparelhos al
  JOIN public.colaboradores c ON c.id = al.colaborador_id
  WHERE al.ativo IS TRUE AND al.aparelho_id IS NOT NULL
  ORDER BY al.aparelho_id, al.data_inicio DESC NULLS LAST
) a
WHERE ap.id = a.item_id
  AND ap.setor_id IN (SELECT id FROM _setores_antigos);

UPDATE public.ramais r
SET setor_id = a.setor_id
FROM (
  SELECT DISTINCT ON (al.ramal_id)
         al.ramal_id AS item_id, c.setor_id
  FROM public.alocacoes_ramais al
  JOIN public.colaboradores c ON c.id = al.colaborador_id
  WHERE al.ativo IS TRUE AND al.ramal_id IS NOT NULL
  ORDER BY al.ramal_id, al.data_inicio DESC NULLS LAST
) a
WHERE r.id = a.item_id
  AND r.setor_id IN (SELECT id FROM _setores_antigos);

-- ---------------------------------------------------------------------------
-- 2. Regra: colaborador inativo nao carrega setor
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_colaborador_inativo_sem_setor()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status <> 'Ativo' THEN
    NEW.setor_id := NULL;
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.fn_colaborador_inativo_sem_setor() IS
  'Colaborador inativo nao mantem vinculo de setor: o setor_id e limpo na gravacao.';

DROP TRIGGER IF EXISTS trg_colaborador_inativo_sem_setor ON public.colaboradores;

CREATE TRIGGER trg_colaborador_inativo_sem_setor
  BEFORE INSERT OR UPDATE OF status, setor_id ON public.colaboradores
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_colaborador_inativo_sem_setor();

DO $$
DECLARE limpos integer;
BEGIN
  UPDATE public.colaboradores
  SET setor_id = NULL
  WHERE status <> 'Ativo' AND setor_id IS NOT NULL;
  GET DIAGNOSTICS limpos = ROW_COUNT;
  RAISE NOTICE 'Colaboradores inativos que perderam o setor no backfill: %', limpos;
END $$;

-- ---------------------------------------------------------------------------
-- 3. Referencias remanescentes aos setores antigos passam a NULL
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  n integer;
  total integer := 0;
BEGIN
  UPDATE public.maquinas SET setor_id = NULL
   WHERE setor_id IN (SELECT id FROM _setores_antigos);
  GET DIAGNOSTICS n = ROW_COUNT; total := total + n;
  RAISE NOTICE 'maquinas sem detentor liberadas: %', n;

  UPDATE public.notebooks SET setor_id = NULL
   WHERE setor_id IN (SELECT id FROM _setores_antigos);
  GET DIAGNOSTICS n = ROW_COUNT; total := total + n;
  RAISE NOTICE 'notebooks sem detentor liberados: %', n;

  UPDATE public.notebooks SET emprestado_setor_id = NULL
   WHERE emprestado_setor_id IN (SELECT id FROM _setores_antigos);
  GET DIAGNOSTICS n = ROW_COUNT; total := total + n;
  RAISE NOTICE 'notebooks com emprestimo para setor antigo liberados: %', n;

  UPDATE public.aparelhos SET setor_id = NULL
   WHERE setor_id IN (SELECT id FROM _setores_antigos);
  GET DIAGNOSTICS n = ROW_COUNT; total := total + n;
  RAISE NOTICE 'aparelhos sem detentor liberados: %', n;

  UPDATE public.ramais SET setor_id = NULL
   WHERE setor_id IN (SELECT id FROM _setores_antigos);
  GET DIAGNOSTICS n = ROW_COUNT; total := total + n;
  RAISE NOTICE 'ramais sem detentor liberados: %', n;

  UPDATE public.impressoras SET setor_id = NULL
   WHERE setor_id IN (SELECT id FROM _setores_antigos);
  GET DIAGNOSTICS n = ROW_COUNT; total := total + n;
  RAISE NOTICE 'impressoras liberadas: %', n;

  UPDATE public.racks SET setor_id = NULL
   WHERE setor_id IN (SELECT id FROM _setores_antigos);
  GET DIAGNOSTICS n = ROW_COUNT; total := total + n;
  RAISE NOTICE 'racks liberados: %', n;

  UPDATE public.checklists_validacao_solicitacoes SET setor_id = NULL
   WHERE setor_id IN (SELECT id FROM _setores_antigos);
  GET DIAGNOSTICS n = ROW_COUNT; total := total + n;
  RAISE NOTICE 'solicitacoes de checklist que perderam o setor: %', n;

  UPDATE public.alocacoes_monitores SET setor_id = NULL
   WHERE setor_id IN (SELECT id FROM _setores_antigos);
  GET DIAGNOSTICS n = ROW_COUNT; total := total + n;
  RAISE NOTICE 'alocacoes de monitores liberadas: %', n;

  RAISE NOTICE 'Total de referencias liberadas no passo 3: %', total;
END $$;

-- ---------------------------------------------------------------------------
-- 4. Guarda e exclusao
-- ---------------------------------------------------------------------------
DO $$
DECLARE pendentes integer;
BEGIN
  SELECT
      (SELECT count(*) FROM public.colaboradores                  WHERE setor_id            IN (SELECT id FROM _setores_antigos))
    + (SELECT count(*) FROM public.maquinas                       WHERE setor_id            IN (SELECT id FROM _setores_antigos))
    + (SELECT count(*) FROM public.notebooks                      WHERE setor_id            IN (SELECT id FROM _setores_antigos))
    + (SELECT count(*) FROM public.notebooks                      WHERE emprestado_setor_id IN (SELECT id FROM _setores_antigos))
    + (SELECT count(*) FROM public.aparelhos                      WHERE setor_id            IN (SELECT id FROM _setores_antigos))
    + (SELECT count(*) FROM public.ramais                         WHERE setor_id            IN (SELECT id FROM _setores_antigos))
    + (SELECT count(*) FROM public.impressoras                    WHERE setor_id            IN (SELECT id FROM _setores_antigos))
    + (SELECT count(*) FROM public.racks                          WHERE setor_id            IN (SELECT id FROM _setores_antigos))
    + (SELECT count(*) FROM public.checklists_validacao_solicitacoes WHERE setor_id          IN (SELECT id FROM _setores_antigos))
    + (SELECT count(*) FROM public.alocacoes_monitores            WHERE setor_id            IN (SELECT id FROM _setores_antigos))
  INTO pendentes;

  IF pendentes <> 0 THEN
    RAISE EXCEPTION 'Setores antigos ainda possuem % referencia(s); exclusao abortada', pendentes;
  END IF;
END $$;

DO $$
DECLARE apagados integer;
BEGIN
  DELETE FROM public.setores
   WHERE id IN (SELECT id FROM _setores_antigos);
  GET DIAGNOSTICS apagados = ROW_COUNT;
  RAISE NOTICE 'Setores antigos apagados: %', apagados;
END $$;

COMMIT;
