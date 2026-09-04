-- Realocação de colaboradores do CSE para os novos núcleos
-- Origem: extração "Pessoas por Núcleo CSE" (2026-09-04) confrontada com o
-- overview de colaboradores do inventário na mesma data.
--
-- Escopo:
--   1. Cria os setores dos núcleos do CSE (sigla em `nome`, nome completo em `descricao`).
--   2. Reaponta `colaboradores.setor_id` das 70 pessoas da nova relação.
--
-- Notas:
--   - O vínculo é feito por `colaboradores.codigo` (chave estável do RH), não por nome:
--     parte dos registros está cadastrada com o nome abreviado no inventário
--     (ex. "Aparecida Alves" para "Aparecida Alves de Mendonça").
--   - Os setores antigos (Secretaria Acadêmica, Secretaria Acadêmica VIRTUAL, Estúdio,
--     Certificação) NÃO são removidos nem desativados aqui. A limpeza será feita em
--     refatoração posterior.
--   - Localidades não são alteradas nesta migration. A extração nova diverge da base
--     apenas para o código 860684 (Stefania Martins de Souza: base IEC - São Gabriel,
--     extração Barreiro); tratar à parte.

BEGIN;

-- 1. Setores dos núcleos do CSE
INSERT INTO public.setores (nome, descricao, ativo)
VALUES
  ('CSE', 'Coordenação de Serviços Educacionais', true),
  ('NAPE', 'Núcleo de Atividades Práticas e Estágios', true),
  ('NCA', 'Núcleo de Conclusão Acadêmica', true),
  ('NGA (ead)', 'Núcleo de Gestão Acadêmica / Cursos Digitais (EAD gravado)', true),
  ('NGA', 'Núcleo de Gestão Acadêmica / Cursos ao Vivo', true),
  ('NIA', 'Núcleo de Ingresso Acadêmico', true),
  ('NPD', 'Núcleo de Produção Digital', true),
  ('NUPAE', 'Núcleo de Projetos Acadêmicos Especiais', true)
ON CONFLICT (nome) DO UPDATE
  SET descricao = EXCLUDED.descricao,
      ativo     = true;

-- 2. Realocação Setor -> Colaborador
WITH nova_relacao (codigo, nome_extracao, setor_anterior, setor_nome) AS (
  VALUES
    (537310, 'Alexandre Magalhães Ribeiro', 'Alexandre Magalhães Ribeiro', 'NGA (ead)'),
    (1037179, 'Ana Luiza Gualberto Martins de Oliveira', 'Ana Luiza Gualberto Martins de Oliveira', 'NGA (ead)'),
    (389164, 'André Gomide do Valle', 'André Gomide do Valle', 'NCA'),
    (735945, 'Aparecida Alves de Mendonça', 'Aparecida Alves', 'NGA'),
    (1431498, 'Bianca da Silva Alvarenga', 'Bianca da Silva Alvarenga', 'NGA'),
    (1577534, 'Bruna Stefani Rodrigues Souza', 'Bruna Stefani Rodrigues Souza', 'NGA'),
    (934505, 'Bruno Hilario Ferreira', 'Bruno Hilario Ferreira', 'NGA (ead)'),
    (981245, 'Bárbara Camila Silva Costa', 'BARBARA CAMILA SILVA COSTA', 'NPD'),
    (1685628, 'Bárbara Katlen Rodrigues Alves Moreira', 'Barbara Katlen Rodrigues Alves Moreira', 'NGA'),
    (1094436, 'Bárbara Meireles Novais', 'Bárbara Meireles Novais', 'NUPAE'),
    (1005264, 'Camila Gravino Dressler', 'Camila Gravino', 'NAPE'),
    (1032483, 'Carla Ferreira Cardoso', 'Carla Ferreira Cardoso', 'NGA (ead)'),
    (1341871, 'Daniela Coelho Mendonça Vieira', 'Daniela Coelho', 'NGA'),
    (1687812, 'Daniela das Gracas de Souza Souto', 'Daniela das Graças de Souza Souto', 'NIA'),
    (1688125, 'David Augusto de Souza Paixão', 'David Augusto de Souza Paixão', 'NPD'),
    (503068, 'Denise Souza Do Vale', 'Denise Souza Do Vale', 'NGA (ead)'),
    (1048514, 'Djalma Junio Albino Andrade dos Santos', 'Djalma Júnio Albino Andrade dos Santos', 'NUPAE'),
    (1414433, 'Eduardo Soares da Silva', 'Eduardo Soares', 'NGA'),
    (652017, 'Efigênia Carolina Olintho Costa', 'Efigênia Carolina Olintho Costa', 'NGA (ead)'),
    (1282416, 'Eliete Rodrigues de Sousa', 'Eliete Rodrigues de Sousa', 'NGA'),
    (687295, 'Emiliane de Fátima Filgueira', 'Emiliane de Fátima Filgueira', 'NGA'),
    (1155601, 'Fernanda Kele Silva', 'Fernanda Kele Silva', 'NGA'),
    (1502711, 'Gabriele Luiza Pedrosa de Oliveira Garcias Batista', 'Gabriele Luiza', 'NGA'),
    (1558565, 'Giovanna Souza Botelho', 'Giovanna Souza Botelho', 'NGA'),
    (1247250, 'Gislaine Aparecida Ferreira', 'Gislaine Aparecida Ferreira', 'NGA (ead)'),
    (1444717, 'Igor Fabiano Gomes', 'Igor Fabiano', 'NGA'),
    (843104, 'Jaqueline Gomes dos Santos de Oliveira', 'Jaqueline Gomes', 'NGA'),
    (554864, 'Jaqueline Pereira dos Anjos', 'Jaqueline Pereira', 'NGA'),
    (1572146, 'Joao Paulo Rodrigues Guerra Menezes', 'João Paulo Rodrigues Guerra Menezes', 'NPD'),
    (1506645, 'João Victor Assis Barreto dos Santos', 'João Victor de Assis Barreto', 'NGA (ead)'),
    (1045283, 'Karoline Cassini Senra', 'Karoline Cassini Senra', 'NGA'),
    (998112, 'Larissa Fernanda Pinto da Silva', 'Larissa Fernanda Pinto da Silva', 'NIA'),
    (1683882, 'Larissa Oliveira dos Santos', 'Larissa Oliveira dos Santos', 'NGA (ead)'),
    (907881, 'Laura Helena Silva Lima', 'Laura Helena Silva Lima', 'NIA'),
    (1366775, 'Luana de Souza Moraes', 'Luana De Souza Moraes', 'NGA'),
    (1439753, 'Lucas Henrique de Jesus Azevedo', 'Lucas Henrique de Jesus Azevedo', 'NGA (ead)'),
    (736010, 'Lucieni Batista Dos Santos', 'Lucieni Batista Dos Santos', 'NGA (ead)'),
    (654299, 'Maria Leticia Goncalves De Oliveira', 'Maria Leticia Goncalves De Oliveira', 'NGA (ead)'),
    (1650515, 'Mariana Marinho Silva', 'Mariana Marinho Silva', 'NGA'),
    (1687952, 'Marina Penna', 'Marina Penna', 'NGA'),
    (1060188, 'Marjorie Pimentel Da Silva', 'Marjorie Pimentel Da Silva', 'NGA (ead)'),
    (1271385, 'Maryane de Cássia Ribeiro Brandão', 'Maryane de Cassia', 'NGA'),
    (1209841, 'Mateus Bernardo Fernandes de Souza', 'Mateus Bernado', 'NGA'),
    (1269099, 'Matheus Rocha Dagostin', 'Matheus Rocha Dagostin', 'NGA'),
    (611689, 'Michelangelo Bragioni Vieira', 'Michelangelo Bragioni Vieira', 'NPD'),
    (1418951, 'Nathália Santos Ladeira da Silva', 'Nathalia Santos', 'NGA'),
    (995402, 'Neide de Sousa Medeiros Nunes', 'Neide de Souza', 'NGA'),
    (466068, 'Noeme Camargos Fernandes', 'Noeme Camargos Fernandes', 'NGA (ead)'),
    (300569, 'Patricia Helena Melo de Mendonca', 'Patricia Helena Melo de Mendonça', 'NGA'),
    (1393861, 'Patrícia Prates Caetano', 'Patrícia Prates Caetano', 'NGA'),
    (1058383, 'Pedro Henrique Ferreira', 'Pedro Henrique Ferreira', 'NGA (ead)'),
    (1474168, 'Poliana Rocha Alencar', 'Poliana Rocha', 'NGA'),
    (1615945, 'Pâmella dos Santos Oliveira', 'Pâmella dos Santos Oliveira', 'NAPE'),
    (1414329, 'Rachel Soares Sabioni Martins', 'Rachel Soares Sabioni Martins', 'NGA'),
    (1238191, 'Regiane Luisa Gonçalves Almeida', 'Regiane Luisa', 'NGA'),
    (310866, 'Renata Kelly Rodrigues Pinto Vilaca', 'Renata Kelly Rodrigues Pinto Vilaca', 'NGA (ead)'),
    (1419891, 'Sandra Taiz Aguiar Alves', 'Sandra Taiz Aguiar Alves', 'NPD'),
    (501459, 'Sara Flores Garcia Drummond', 'Sara Flores', 'NGA'),
    (1100480, 'Sheila Adriane Nunes Klein', 'Sheila Adriane', 'NGA'),
    (860684, 'Stefania Martins de Souza', 'Stefania Martins de Souza', 'NGA'),
    (1150874, 'Stephanny Silva Celestino', 'Stephanny Silva Celestino', 'NGA (ead)'),
    (997294, 'Taiza Cristina Prates Batista Mendes', 'Taiza Cristina', 'NGA'),
    (946047, 'Tamara Gonzaga Homem', 'Tamara Gonzaga Homem', 'NGA (ead)'),
    (301335, 'Tatiana Barbosa Vilela', 'Tatiana Barbosa', 'NGA'),
    (1063999, 'Thais Oliveira Figueiredo', 'Thais Oliveira', 'NGA'),
    (872347, 'Thales Antenor Alves Dos Santos', 'Thales Antenor Alves Dos Santos', 'NGA (ead)'),
    (1689477, 'Vitória Muniz Ferreira', 'Vitória Muniz Ferreira ', 'NPD'),
    (819546, 'Wesly de Souza Barcelos Junior', 'Wesly de Souza Barcelos Júnior', 'NGA'),
    (1116723, 'Yara Moreira Londres', 'Yara Moreira Londres', 'NGA (ead)'),
    (290096, 'Érica Vaz Cardoso', 'Érica Vaz Cardoso', 'CSE')
  )
UPDATE public.colaboradores c
SET setor_id = s.id
FROM nova_relacao nr
JOIN public.setores s ON s.nome = nr.setor_nome
WHERE c.codigo = nr.codigo;

-- 3. Guarda: garante que as 70 pessoas foram reapontadas
DO $$
DECLARE
  esperado integer := 70;
  atualizado integer;
BEGIN
  SELECT count(DISTINCT c.codigo)
  INTO atualizado
  FROM public.colaboradores c
  JOIN public.setores s ON s.id = c.setor_id
  WHERE c.codigo IN (537310, 1037179, 389164, 735945, 1431498, 1577534, 934505, 981245, 1685628, 1094436, 1005264, 1032483, 1341871, 1687812, 1688125, 503068, 1048514, 1414433, 652017, 1282416, 687295, 1155601, 1502711, 1558565, 1247250, 1444717, 843104, 554864, 1572146, 1506645, 1045283, 998112, 1683882, 907881, 1366775, 1439753, 736010, 654299, 1650515, 1687952, 1060188, 1271385, 1209841, 1269099, 611689, 1418951, 995402, 466068, 300569, 1393861, 1058383, 1474168, 1615945, 1414329, 1238191, 310866, 1419891, 501459, 1100480, 860684, 1150874, 997294, 946047, 301335, 1063999, 872347, 1689477, 819546, 1116723, 290096)
    AND s.nome IN ('CSE', 'NAPE', 'NCA', 'NGA (ead)', 'NGA', 'NIA', 'NPD', 'NUPAE');

  IF atualizado <> esperado THEN
    RAISE EXCEPTION 'Realocacao CSE incompleta: esperado %, obtido %', esperado, atualizado;
  END IF;
END $$;

COMMIT;
