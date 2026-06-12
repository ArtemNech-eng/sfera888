CREATE TABLE "order_amount_audit" (
	"id" serial PRIMARY KEY NOT NULL,
	"order_id" integer NOT NULL,
	"actor_user_id" integer,
	"actor_role" varchar(32),
	"actor_alias" text,
	"field" varchar(32) NOT NULL,
	"previous_value" text,
	"new_value" text NOT NULL,
	"source" varchar(32) NOT NULL,
	"reason" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);

ALTER TABLE "orders" ADD COLUMN "agreement_amount_source" varchar(32);
ALTER TABLE "orders" ADD COLUMN "payment_state_changed_at" timestamp;
ALTER TABLE "orders" ADD COLUMN "agreement_note" text;
ALTER TABLE "order_amount_audit" ADD CONSTRAINT "order_amount_audit_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "order_amount_audit" ADD CONSTRAINT "order_amount_audit_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
CREATE INDEX "order_amount_audit_order_idx" ON "order_amount_audit" USING btree ("order_id","created_at");


-- ─────────────────────────────────────────────────────────────────────────────
-- Backfill: исторические заказы получают agreement_amount_source = 'unknown'
--
-- Любой order, у которого orderAmount уже был установлен до этой миграции,
-- считаем "источник суммы неизвестен" — мы не можем восстановить, через
-- Receipt_Path или ручной ввод оператора. Это безопасный default: Phase 2
-- логика будет читать computePaymentState() для этих заказов как "agreed"
-- (потому что orderAmount > 0), и спам-каналы автоматически перестают
-- по ним стрелять при включении флага.
-- См. .kiro/specs/estimate-optional-flow/requirements.md decision Q11.
-- ─────────────────────────────────────────────────────────────────────────────
UPDATE "orders"
SET "agreement_amount_source" = 'unknown'
WHERE "order_amount" IS NOT NULL
  AND "agreement_amount_source" IS NULL;
