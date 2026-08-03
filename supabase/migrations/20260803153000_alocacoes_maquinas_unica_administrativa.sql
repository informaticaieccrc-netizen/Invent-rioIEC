CREATE OR REPLACE FUNCTION public.enforce_alocacoes_maquinas_colaborador_unico()
RETURNS trigger AS $$
DECLARE
  nova_categoria public.categoria_equipamento;
BEGIN
  IF NEW.ativo IS TRUE AND NEW.colaborador_id IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(hashtext(NEW.colaborador_id::text));

    IF NEW.maquina_id IS NOT NULL AND EXISTS (
      SELECT 1
      FROM public.alocacoes_maquinas existing
      WHERE existing.colaborador_id = NEW.colaborador_id
        AND existing.ativo IS TRUE
        AND existing.id <> NEW.id
        AND existing.maquina_id = NEW.maquina_id
    ) THEN
      RAISE EXCEPTION 'Colaborador % já possui alocação ativa nesta máquina.', NEW.colaborador_id;
    END IF;

    SELECT categoria
    INTO nova_categoria
    FROM public.maquinas
    WHERE id = NEW.maquina_id;

    IF nova_categoria = 'Administrativa'::public.categoria_equipamento AND EXISTS (
      SELECT 1
      FROM public.alocacoes_maquinas existing
      JOIN public.maquinas maquina ON maquina.id = existing.maquina_id
      WHERE existing.colaborador_id = NEW.colaborador_id
        AND existing.ativo IS TRUE
        AND existing.id <> NEW.id
        AND maquina.categoria = 'Administrativa'::public.categoria_equipamento
    ) THEN
      RAISE EXCEPTION 'Colaborador % já possui máquina administrativa ativa. Encerre a alocação administrativa atual antes de criar outra.', NEW.colaborador_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_alocacoes_maquinas_colaborador_unico ON public.alocacoes_maquinas;

CREATE TRIGGER trg_alocacoes_maquinas_colaborador_unico
BEFORE INSERT OR UPDATE OF colaborador_id, maquina_id, ativo ON public.alocacoes_maquinas
FOR EACH ROW
EXECUTE FUNCTION public.enforce_alocacoes_maquinas_colaborador_unico();
