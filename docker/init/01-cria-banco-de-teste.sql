-- Banco separado para os testes de integração (T4 em diante).
--
-- Roda uma única vez, na criação do volume. Se você precisar que ele rode de novo
-- (por exemplo depois de editar este arquivo), use `pnpm db:reset`, que derruba o volume.
CREATE DATABASE lumens_test;
