# Requirements Document

## Remove Token Payment Model

> **Статус**: Draft / Skeleton. Создан как placeholder во время работы над `estimate-optional-flow` Phase 2 (см. discovered issue: T11 нечего refactor'ить, потому что `paymentModel = "token"` живёт по другому codepath чем предполагалось).
>
> Реальная работа по этой фиче — отдельная сессия. Здесь зафиксированы цель, объём и связи с другими модулями.

## Introduction

В системе исторически две модели оплаты заказа:

- **`commission`**: рублёвая модель. Мастер получает заказ, выполняет, оператор подтверждает сумму, рассчитывается комиссия (фикс 5к до 50к, 15% выше). Service fee 500₽ списывается с `master_wallet` при отклике мастера на заказ (см. `lib/accountBalance.ts:deductServiceFee`).
- **`token`**: модель за токены. Мастер платит N токенов из `master_wallet.tokensBalance` при отклике на заявку. Объём тарифицируется по `service_token_prices` × `city_token_multipliers` (или `manualTokenCost` если установлен оператором).

Token-модель используется в основном для **партнёрских заявок** (`leads.source = "avito_partner"` или `leads.trafficPartnerId != null` → `routes/orders.ts:332` форсит `paymentModel = "token"`). Это создаёт следующие проблемы:

1. **Двойная бизнес-логика** во всех 5+ модулях (CRM, master-pwa, work-board, finance, analytics) — везде `if (paymentModel === "token") ... else ...`. Каждое изменение приходится делать в двух местах.
2. **Двойные типы данных**: `orders.tokensCharged` + `orders.commission` параллельно; `master_wallet.tokensBalance` + `master_wallet.balance` (рублёвый); `wallet_transactions` (токены) + `transactions` + `transaction_payments` (рубли).
3. **Путаница в UI**: оператор должен решить при создании lead'а — токены или комиссия. Бейдж "Токены" / "Комиссия" в work-board, отдельные фильтры, разные расчёты в analytics.
4. **Сложность миграции/changes**: новые фичи (например, `estimate-optional-flow`) вынуждены учитывать обе модели на каждом шаге.
5. **Бесполезная гибкость**: бизнес заявил, что одной модели **commission + service fee 500₽** достаточно для всех случаев, включая партнёрских.

Эта фича удаляет token-модель полностью, мигрирует все active-orders на commission, и убирает всю инфраструктуру токенов.

## Glossary

- **Token_Order**: заказ с `payment_model = "token"`.
- **Commission_Order**: заказ с `payment_model = "commission"`.
- **Token_Wallet**: токеновый кошелёк мастера (`master_wallet.tokensBalance`, `wallet_transactions`).
- **Service_Fee**: фиксированный сбор 500₽ за отклик на заявку, реализован в `lib/accountBalance.ts`.
- **Migration**: процесс перевода всех существующих Token_Orders в Commission_Orders.

## Requirements

### Requirement 1: Все новые Order создаются как Commission_Order

**User Story:** Как Operator, я хочу не выбирать модель оплаты при создании заявки, чтобы не путаться. Все заказы — commission.

#### Acceptance Criteria

1. THE CRM `CreateLeadModal` SHALL не показывать toggle "По токенам / Обычная комиссия".
2. THE API_Server `POST /api/leads` SHALL устанавливать `lead.paymentModel = "commission"` всегда, игнорируя любой переданный `paymentModel`.
3. THE API_Server `POST /api/leads/:id/send-to-buffer` (создание Order из Lead) SHALL устанавливать `order.paymentModel = "commission"` всегда.
4. THE API_Server SHALL не различать партнёрские vs обычные заказы по `paymentModel` — все идут как commission.

### Requirement 2: Миграция существующих Token_Orders

**User Story:** Как владелец продукта, я хочу безболезненно перевести все open token-orders на commission, чтобы мастера не потеряли в деньгах.

#### Acceptance Criteria

1. THE Migration SHALL для каждого `Order` с `paymentModel = "token"` И `status NOT IN ('completed', 'cancelled')`:
   - Установить `paymentModel = "commission"`
   - Если `tokensCharged > 0` И сумма заказа неизвестна, попросить оператора подтвердить вручную
   - Создать `transactions` запись если ещё нет
2. THE Migration SHALL вернуть мастерам остаток `tokensBalance` в виде рублей по курсу 1 токен = X рублей (Open question: курс).
3. THE Migration SHALL логировать все изменения в новый audit-лог `token_migration_log` для возможности отката.

### Requirement 3: Удаление токенового UI в Master_PWA

**User Story:** Как Master, я хочу видеть единый интерфейс отклика без разделения на токены/комиссию.

#### Acceptance Criteria

1. THE Master_PWA SHALL не показывать "Стоимость заявки в токенах" на карточке заказа.
2. THE Master_PWA SHALL не показывать `tokensBalance` на странице баланса.
3. THE Master_PWA SHALL показывать только Service_Fee (500₽) при отклике.
4. THE Master_PWA SHALL не показывать кнопку "Запросить возврат токена".

### Requirement 4: Удаление токенового UI в CRM

**User Story:** Как Operator, я хочу видеть единые карточки заказов без token-бейджей.

#### Acceptance Criteria

1. THE CRM `work-board-table.tsx` SHALL не показывать бейдж "💎 Токены" и не иметь отдельных фильтров по `paymentModel`.
2. THE CRM `OrderPanel.tsx` SHALL не показывать `tokensCharged` или `manualTokenCost`.
3. THE CRM Analytics SHALL не разделять отчёты на token vs commission.

### Requirement 5: Удаление инфраструктуры

**User Story:** Как разработчик, я хочу удалить deprecated/неиспользуемый код, чтобы система была проще.

#### Acceptance Criteria

1. THE schema SHALL удалить таблицы: `master_wallet.tokensBalance` (колонку), `wallet_transactions`, `service_token_prices`, `service_token_rules`, `city_token_multipliers`, `token_audit_log`, `token_packages`, `token_price_history`, `master_active_packages`.
2. THE schema SHALL удалить колонки: `orders.tokensCharged`, `orders.manualTokenCost`, `orders.paymentModel` (или сделать `commission` единственным значением).
3. THE code SHALL удалить файлы: `lib/tokenWallet.ts`, все обработчики `paymentModel === "token"` ветки, `routes/wallet.ts` token-методы.
4. THE code SHALL не имитировать удалённую функциональность через стабы.

## Open Questions

Будут уточнены при детализации:

1. **Курс конверсии токенов в рубли** при миграции остаточных балансов мастеров.
2. **Партнёрская интеграция**: как сейчас партнёры (Avito, и т.д.) узнают о тарификации? Нужно ли менять API контракт партнёров?
3. **Reward для мастеров с большими token-балансами** — есть ли исторические договоренности?
4. **Backward-compat refund window**: сколько дней даём мастерам на запрос возврата по уже отправленным token-заявкам?
5. **Rollback план**: можем ли мы отменить миграцию через 24h если что-то сломалось?

## Notes

- **Зависимость**: рекомендуется выполнить ПОСЛЕ завершения `estimate-optional-flow` (Phase 2-3), чтобы не пересекать большие изменения.
- **Риски миграции**: если у мастера есть открытый token-заказ и tokensBalance = 0, после миграции он не сможет работать (service fee 500₽ требует balance ≥ 500). Нужно предусмотреть credit_limit или одноразовый bonus.
- **Партнёрская интеграция**: критическая зависимость. Нельзя удалять token-модель пока партнёры не уведомлены и API не переделан.
- **Объём работы**: ~30-50 файлов, ~5-10 таблиц схемы, миграция данных, переделка партнёрского API. Оценка 2-3 недели работы.
