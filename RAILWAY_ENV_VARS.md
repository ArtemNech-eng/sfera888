# Переменные окружения для Railway

## Обязательные

| Переменная | Описание | Пример |
|---|---|---|
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://user:pass@host:5432/db` |
| `SESSION_SECRET` | Секрет для express-session | случайная строка 32+ символа |
| `ADMIN_PASSWORD` | Пароль для admin-пользователя | `admin2026` |

## Домен и VAPID (push-уведомления)

| Переменная | Описание | Пример |
|---|---|---|
| `APP_DOMAIN` | Домен приложения без `https://` (раньше был `REPLIT_DOMAINS`) | `your-app.up.railway.app` |
| `VAPID_PUBLIC_KEY` | VAPID public key для Web Push | `BEsTKPbpLdg3SuDxyu9m3xFFr6...` |
| `VAPID_PRIVATE_KEY` | VAPID private key для Web Push | `PlPmqNhWM4ioOIikpRw3WX...` |
| `VAPID_EMAIL` | Email для VAPID | `mailto:admin@sfera-master.ru` |

## Яндекс Карты

| Переменная | Описание |
|---|---|
| `VITE_YANDEX_MAPS_KEY` | API-ключ Яндекс Карт |

## AI-интеграции (OpenAI)

Используются в: `agentMemory.ts`, `autonomousAgent.ts`, `managerBot.ts`, `dispatcherAI.ts`, `avito.ts`, `client.ts`, `leads.ts`, `master-reviews.ts`

| Переменная | Описание |
|---|---|
| `AI_INTEGRATIONS_OPENAI_API_KEY` | API-ключ OpenAI (получить на platform.openai.com) |
| `AI_INTEGRATIONS_OPENAI_BASE_URL` | Base URL для OpenAI API. Для официального OpenAI: `https://api.openai.com/v1` |

> ⚠️ На Replit эти переменные указывали на Replit AI proxy. Теперь нужны реальные ключи OpenAI.

## AI-интеграции (Gemini)

Используется в: `contract.ts`

| Переменная | Описание |
|---|---|
| `AI_INTEGRATIONS_GEMINI_API_KEY` | API-ключ Google Gemini (получить на aistudio.google.com) |
| `AI_INTEGRATIONS_GEMINI_BASE_URL` | Base URL для Gemini API. Пример: `https://generativelanguage.googleapis.com/v1beta/openai` |

## Google Cloud Storage (хранение файлов)

Используется для: аватары мастеров, фото заказов, паспорта, скриншоты смет

| Переменная | Описание |
|---|---|
| `GCS_KEY_JSON` | JSON-строка service account key (содержимое файла ключа целиком) |
| `DEFAULT_OBJECT_STORAGE_BUCKET_ID` | Имя GCS bucket |
| `PUBLIC_OBJECT_SEARCH_PATHS` | Пути для публичных объектов (через запятую) |
| `PRIVATE_OBJECT_DIR` | Директория для приватных объектов |

> Для `GCS_KEY_JSON` скопируйте содержимое JSON-файла service account key целиком как одну строку.
> Альтернатива: задать `GOOGLE_APPLICATION_CREDENTIALS` с путём к файлу ключа.

## Яндекс Pay

| Переменная | Описание |
|---|---|
| `YANDEX_PAY_API_KEY` | API-ключ Яндекс Pay |

## Max Bot (VK)

| Переменная | Описание |
|---|---|
| `MAX_BOT_TOKEN` | Токен Max-бота |

## Что было удалено (Replit-специфичное)

- `REPLIT_DOMAINS` → заменено на `APP_DOMAIN`
- `AI_INTEGRATIONS_OPENAI_BASE_URL` раньше указывал на Replit AI proxy — теперь нужен реальный OpenAI URL
- `AI_INTEGRATIONS_GEMINI_BASE_URL` аналогично
- Object Storage работал через Replit sidecar (http://127.0.0.1:1106) — теперь через стандартный GCS SDK
