ALTER TABLE public.solicitacoes_inventario
  ADD COLUMN IF NOT EXISTS pedido_pai_id uuid,
  ADD COLUMN IF NOT EXISTS malote_id uuid,
  ADD COLUMN IF NOT EXISTS malote_ordem integer NOT NULL DEFAULT 1;

UPDATE public.solicitacoes_inventario
SET malote_id = id
WHERE malote_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_solicitacoes_inventario_pedido_pai
  ON public.solicitacoes_inventario(pedido_pai_id);

CREATE INDEX IF NOT EXISTS idx_solicitacoes_inventario_malote
  ON public.solicitacoes_inventario(malote_id);

DO $$
DECLARE
  duplicate_count integer;
BEGIN
  SELECT count(*)
  INTO duplicate_count
  FROM (
    SELECT colaborador_id
    FROM public.alocacoes_maquinas
    WHERE ativo IS TRUE AND colaborador_id IS NOT NULL
    GROUP BY colaborador_id
    HAVING count(*) > 1
  ) duplicated_collaborators;

  IF duplicate_count > 0 THEN
    RAISE NOTICE 'Existem % colaborador(es) com mais de uma máquina ativa antes desta migration. A regra passa a bloquear novas duplicidades; corrija os vínculos existentes separadamente.', duplicate_count;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_alocacoes_maquinas_colaborador_ativo
  ON public.alocacoes_maquinas(colaborador_id)
  WHERE ativo IS TRUE AND colaborador_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.enforce_alocacoes_maquinas_colaborador_unico()
RETURNS trigger AS $$
BEGIN
  IF NEW.ativo IS TRUE AND NEW.colaborador_id IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(hashtext(NEW.colaborador_id::text));

    IF EXISTS (
      SELECT 1
      FROM public.alocacoes_maquinas existing
      WHERE existing.colaborador_id = NEW.colaborador_id
        AND existing.ativo IS TRUE
        AND existing.id <> NEW.id
    ) THEN
      RAISE EXCEPTION 'Colaborador % já possui máquina ativa. Encerre a alocação atual antes de criar outra.', NEW.colaborador_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_alocacoes_maquinas_colaborador_unico ON public.alocacoes_maquinas;

CREATE TRIGGER trg_alocacoes_maquinas_colaborador_unico
BEFORE INSERT OR UPDATE OF colaborador_id, ativo ON public.alocacoes_maquinas
FOR EACH ROW
EXECUTE FUNCTION public.enforce_alocacoes_maquinas_colaborador_unico();
