-- Garante que o perfil dev exista como role distinta de admin/viewer.
-- Dev mantém os privilégios de admin na aplicação e libera ferramentas técnicas extras.

UPDATE usuarios
SET perfil = 'dev'
WHERE lower(email) = 'dev@pucminas.br'
   OR lower(nome) = 'desenvolvimento';

ALTER TABLE usuarios
  DROP CONSTRAINT IF EXISTS chk_usuarios_perfil;

ALTER TABLE usuarios
  ADD CONSTRAINT chk_usuarios_perfil
  CHECK (perfil IS NULL OR perfil IN ('viewer', 'admin', 'dev'));
