-- Migration: Community Phone Registration — форумная регистрация по паролю
-- Spec: .kiro/specs/community-phone-registration/
-- Requirements: 1.2, 6.1
--
-- Аддитивная миграция: добавляет nullable-колонку `password_hash` в
-- существующую таблицу `community_accounts`. НЕ изменяет и НЕ удаляет
-- существующие столбцы/строки, поэтому текущие аккаунты (в т.ч.
-- Legacy_Verified_Account с проставленным phone_verified_at) продолжают
-- работать без изменений и сохраняют право публикации.
--
-- Идемпотентность: DDL обёрнут в ADD COLUMN IF NOT EXISTS — повторный
-- прогон безопасен для running production.

-- =============================================================================
-- 1. ALTER TABLE community_accounts — bcryptjs-хеш Password (Password_Hash)
-- =============================================================================

ALTER TABLE community_accounts
  ADD COLUMN IF NOT EXISTS password_hash varchar(100);

COMMENT ON COLUMN community_accounts.password_hash IS 'bcryptjs-хеш Password (Password_Hash); NULL = пароль не задан (Requirement 1.2, 6.1)';
