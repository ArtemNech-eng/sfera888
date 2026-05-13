-- Скрипт для исправления имён мастеров
-- Заменяет "Мастер #ID" на более информативные имена

-- Вариант 1: Если есть телефон, использовать его
UPDATE masters
SET alias = 'Мастер ' || phone
WHERE alias LIKE 'Мастер #%'
  AND phone IS NOT NULL
  AND phone != '';

-- Вариант 2: Если есть город и специализация, использовать их
UPDATE masters
SET alias = specialization || ' (' || city || ')'
WHERE alias LIKE 'Мастер #%'
  AND (phone IS NULL OR phone = '');

-- Вариант 3: Для оставшихся - использовать ID с городом
UPDATE masters
SET alias = 'Мастер ' || id || ' (' || city || ')'
WHERE alias LIKE 'Мастер #%';

-- Проверка результата
SELECT id, alias, phone, city, specialization, status
FROM masters
WHERE deleted_at IS NULL
ORDER BY id;
