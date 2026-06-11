CREATE TYPE "public"."user_role" AS ENUM('admin', 'lead_operator', 'master_operator', 'partner');
CREATE TYPE "public"."lead_status" AS ENUM('new', 'processing', 'sent_to_work', 'non_target', 'client_refusal');
CREATE TYPE "public"."master_status" AS ENUM('active', 'suspended', 'inactive', 'pending_contract');
CREATE TYPE "public"."order_status" AS ENUM('waiting_master', 'master_assigned', 'in_progress', 'completed', 'cancelled', 'cancellation_requested');
CREATE TYPE "public"."dispatch_status" AS ENUM('sent', 'responded', 'assigned', 'rejected');
CREATE TYPE "public"."payment_status" AS ENUM('pending', 'paid', 'overdue');
CREATE TYPE "public"."chat_stage" AS ENUM('new', 'processing', 'deciding', 'on_site', 'completed', 'cancelled');
CREATE TYPE "public"."task_category" AS ENUM('followup', 'payment', 'amount_check', 'report_check', 'quality_check', 'rating', 'general');
CREATE TYPE "public"."task_priority" AS ENUM('low', 'medium', 'high', 'urgent');
CREATE TYPE "public"."task_status" AS ENUM('open', 'in_progress', 'done', 'snoozed');
CREATE TYPE "public"."task_type" AS ENUM('manual', 'ai_auto');
CREATE TYPE "public"."order_stage_status" AS ENUM('pending', 'paid');
CREATE TABLE "ai_error_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"error_id" varchar(16) NOT NULL,
	"first_seen" timestamp with time zone NOT NULL,
	"last_seen" timestamp with time zone NOT NULL,
	"level" varchar(20) NOT NULL,
	"source" varchar(100) NOT NULL,
	"message" text NOT NULL,
	"count" integer DEFAULT 1 NOT NULL,
	"severity" varchar(20) NOT NULL,
	"sample_line" integer,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ai_error_logs_error_id_unique" UNIQUE("error_id")
);

CREATE TABLE "avito_settings" (
	"id" serial PRIMARY KEY NOT NULL,
	"client_id" text,
	"client_secret" text,
	"access_token" text,
	"refresh_token" text,
	"token_expires_at" timestamp,
	"avito_user_id" text,
	"avito_user_name" text,
	"auth_type" text DEFAULT 'client_credentials',
	"enabled" boolean DEFAULT false NOT NULL,
	"advance_balance" integer DEFAULT 0,
	"advance_balance_updated_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);

CREATE TABLE "balance_topup_requests" (
	"id" serial PRIMARY KEY NOT NULL,
	"master_id" integer NOT NULL,
	"amount" numeric(10, 2) NOT NULL,
	"status" varchar(50) DEFAULT 'pending' NOT NULL,
	"note" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"approved_at" timestamp,
	"approved_by_user_id" integer
);

CREATE TABLE "bot_memory" (
	"id" serial PRIMARY KEY NOT NULL,
	"master_id" integer,
	"category" varchar(60) NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE "browser_agent_scenarios" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"task_template" text NOT NULL,
	"icon" text DEFAULT 'globe',
	"color" text DEFAULT 'blue',
	"run_count" integer DEFAULT 0 NOT NULL,
	"last_run_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE "city_token_multipliers" (
	"id" serial PRIMARY KEY NOT NULL,
	"city" varchar(150) NOT NULL,
	"multiplier" numeric(6, 4) DEFAULT '1.0000' NOT NULL,
	"notes" varchar(255),
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "city_token_multipliers_city_unique" UNIQUE("city")
);

CREATE TABLE "client_push_subscriptions" (
	"id" serial PRIMARY KEY NOT NULL,
	"phone" text NOT NULL,
	"endpoint" text NOT NULL,
	"p256dh" text NOT NULL,
	"auth" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "client_push_subscriptions_endpoint_unique" UNIQUE("endpoint")
);

CREATE TABLE "client_support_messages" (
	"id" serial PRIMARY KEY NOT NULL,
	"receipt_token" varchar(64) NOT NULL,
	"message" text NOT NULL,
	"from_client" boolean DEFAULT true NOT NULL,
	"operator_name" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"seen_at" timestamp
);

CREATE TABLE "dispatch_resend_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"order_id" integer NOT NULL,
	"resend_number" integer DEFAULT 1 NOT NULL,
	"scope" text DEFAULT 'non_responders' NOT NULL,
	"recipient_count" integer NOT NULL,
	"sent_at" timestamp DEFAULT now() NOT NULL,
	"created_by" integer,
	"response_count" integer DEFAULT 0
);

CREATE TABLE "dispatcher_followups" (
	"id" serial PRIMARY KEY NOT NULL,
	"master_id" integer NOT NULL,
	"order_id" integer,
	"followup_at" timestamp NOT NULL,
	"question" text NOT NULL,
	"context" text,
	"sent" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE "fomo_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"master_id" integer NOT NULL,
	"event_type" text NOT NULL,
	"reason" text,
	"order_id" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE "general_support_messages" (
	"id" serial PRIMARY KEY NOT NULL,
	"client_phone" varchar(20) NOT NULL,
	"client_name" text,
	"message" text NOT NULL,
	"from_client" boolean DEFAULT true NOT NULL,
	"operator_name" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"seen_at" timestamp
);

CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"login" text NOT NULL,
	"password_hash" text NOT NULL,
	"name" text NOT NULL,
	"role" "user_role" NOT NULL,
	"permissions" jsonb DEFAULT '[]'::jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_login_unique" UNIQUE("login")
);

CREATE TABLE "leads" (
	"id" serial PRIMARY KEY NOT NULL,
	"client_name" text NOT NULL,
	"client_phone" text NOT NULL,
	"city" text NOT NULL,
	"district" text NOT NULL,
	"service_type" text NOT NULL,
	"area" numeric(10, 2) NOT NULL,
	"services" text,
	"scheduled_at" timestamp,
	"comment" text,
	"photos" text,
	"source" text,
	"avito_item_id" text,
	"avito_item_title" text,
	"status" "lead_status" DEFAULT 'new' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp,
	"cancellation_reason" text,
	"status_updated_at" timestamp,
	"traffic_partner_id" integer,
	"lead_channel" varchar(100) DEFAULT 'avito_partner',
	"is_possible_duplicate" boolean DEFAULT false,
	"partner_lead_status" varchar(50),
	"partner_rejection_reason" varchar(500),
	"payment_model" varchar(50) DEFAULT 'commission' NOT NULL
);

CREATE TABLE "masters" (
	"id" serial PRIMARY KEY NOT NULL,
	"alias" text NOT NULL,
	"city" text NOT NULL,
	"specialization" text NOT NULL,
	"specializations" text[] DEFAULT '{}' NOT NULL,
	"telegram_id" text,
	"phone" text,
	"status" "master_status" DEFAULT 'active' NOT NULL,
	"rating" numeric(3, 2) DEFAULT '3.0' NOT NULL,
	"total_orders" integer DEFAULT 0 NOT NULL,
	"accepted_orders" integer DEFAULT 0 NOT NULL,
	"total_leads_received" integer DEFAULT 0 NOT NULL,
	"avg_response_time" numeric(10, 2),
	"debt" numeric(12, 2) DEFAULT '0' NOT NULL,
	"voronka_column_id" integer,
	"is_test_master" boolean DEFAULT true NOT NULL,
	"tags" text[] DEFAULT '{}' NOT NULL,
	"custom_avatar_url" text,
	"contract_link" text,
	"pwa_login" text,
	"pwa_password_hash" text,
	"working_hours" jsonb,
	"preferred_districts" text[] DEFAULT '{}' NOT NULL,
	"min_area" integer DEFAULT 0 NOT NULL,
	"deleted_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"contract_signed_at" timestamp,
	"contract_sign_ip" text,
	"passport_photo_url" text,
	"passport_reg_photo_url" text,
	"passport_verified" boolean DEFAULT false NOT NULL,
	"passport_verify_note" text,
	"contract_full_name" text,
	"contract_passport_number" text,
	"contract_passport_date" text,
	"contract_passport_issuer" text,
	"contract_address" text,
	"last_seen_at" timestamp,
	"max_chat_id" text,
	"service_prices" jsonb,
	"suspended_at" timestamp,
	"suspension_reason" text,
	"fomo_disabled" boolean DEFAULT false NOT NULL,
	"max_active_orders" integer DEFAULT 1 NOT NULL,
	"consecutive_cancellations" integer DEFAULT 0 NOT NULL,
	"blocked_from_orders" boolean DEFAULT false NOT NULL,
	"blocked_at" timestamp,
	"blocked_reason" text,
	"last_cancel_at" timestamp,
	"last_completed_at" timestamp,
	"manual_unblocks_count" integer DEFAULT 0 NOT NULL
);

CREATE TABLE "orders" (
	"id" serial PRIMARY KEY NOT NULL,
	"lead_id" integer NOT NULL,
	"city" text NOT NULL,
	"district" text NOT NULL,
	"service_type" text NOT NULL,
	"area" numeric(10, 2) NOT NULL,
	"services" text,
	"scheduled_at" timestamp,
	"comment" text,
	"status" "order_status" DEFAULT 'waiting_master' NOT NULL,
	"master_id" integer,
	"proposed_amount" numeric(12, 2),
	"order_amount" numeric(12, 2),
	"commission" numeric(12, 2),
	"client_rating" integer,
	"cancel_reason" text,
	"cancel_type" text,
	"dispatch_status" text DEFAULT 'none' NOT NULL,
	"master_work_status" text,
	"operator_note" text,
	"assigned_at" timestamp,
	"completed_at" timestamp,
	"photos_before" text[] DEFAULT '{}' NOT NULL,
	"photos_after" text[] DEFAULT '{}' NOT NULL,
	"photo_act" text,
	"response_window_close_at" timestamp,
	"dispatch_wave" integer DEFAULT 1 NOT NULL,
	"broadcast_count" integer DEFAULT 0 NOT NULL,
	"last_broadcast_at" timestamp,
	"dispatch_resend_count" integer DEFAULT 0 NOT NULL,
	"last_dispatch_resend_at" timestamp,
	"avito_lead_id" text,
	"avito_chat_id" text,
	"client_name" text,
	"client_phone" text,
	"rooms_count" integer,
	"prepayment_amount" numeric(10, 2) DEFAULT '0' NOT NULL,
	"prepayment_deducted" boolean DEFAULT false NOT NULL,
	"commission_paid" boolean DEFAULT false NOT NULL,
	"client_review" text,
	"reviewed_at" timestamp,
	"master_comment" text,
	"photos" text[],
	"source" text DEFAULT 'crm' NOT NULL,
	"payment_model" varchar(50) DEFAULT 'commission' NOT NULL,
	"tokens_charged" numeric(10, 2) DEFAULT '0' NOT NULL,
	"manual_token_cost" numeric(10, 2),
	"max_masters" integer DEFAULT 3 NOT NULL,
	"assigned_master_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp
);

CREATE TABLE "order_dispatches" (
	"id" serial PRIMARY KEY NOT NULL,
	"order_id" integer NOT NULL,
	"master_id" integer NOT NULL,
	"telegram_chat_id" text NOT NULL,
	"telegram_message_id" text,
	"status" "dispatch_status" DEFAULT 'sent' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"responded_at" timestamp,
	"rejection_reason" text,
	"response_note" text
);

CREATE TABLE "transactions" (
	"id" serial PRIMARY KEY NOT NULL,
	"order_id" integer NOT NULL,
	"master_id" integer NOT NULL,
	"order_amount" numeric(12, 2) NOT NULL,
	"commission" numeric(12, 2) NOT NULL,
	"service_fee" numeric(10, 2) DEFAULT '0' NOT NULL,
	"prepayment_deducted" numeric(12, 2) DEFAULT '0' NOT NULL,
	"payment_status" "payment_status" DEFAULT 'pending' NOT NULL,
	"source_type" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"paid_at" timestamp,
	"snooze_until" timestamp,
	"snooze_note" text
);

CREATE TABLE "transaction_payments" (
	"id" serial PRIMARY KEY NOT NULL,
	"transaction_id" integer NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"note" text,
	"paid_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE "cities" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	CONSTRAINT "cities_name_unique" UNIQUE("name")
);

CREATE TABLE "service_types" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	CONSTRAINT "service_types_name_unique" UNIQUE("name")
);

CREATE TABLE "system_settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" text NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE "telegram_chats" (
	"id" serial PRIMARY KEY NOT NULL,
	"telegram_chat_id" text NOT NULL,
	"username" text,
	"first_name" text,
	"last_name" text,
	"avatar_url" text,
	"stage" "chat_stage" DEFAULT 'new' NOT NULL,
	"assigned_operator_id" integer,
	"last_message" text,
	"last_message_at" timestamp,
	"unread_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "telegram_chats_telegram_chat_id_unique" UNIQUE("telegram_chat_id")
);

CREATE TABLE "telegram_messages" (
	"id" serial PRIMARY KEY NOT NULL,
	"chat_id" text NOT NULL,
	"telegram_message_id" integer,
	"text" text NOT NULL,
	"from_bot" boolean DEFAULT false NOT NULL,
	"sender_name" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE "voronka_columns" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"receives_orders" boolean DEFAULT false NOT NULL,
	"color" text DEFAULT 'blue' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE "master_messages" (
	"id" serial PRIMARY KEY NOT NULL,
	"master_id" integer NOT NULL,
	"telegram_chat_id" text NOT NULL,
	"text" text NOT NULL,
	"from_master" boolean DEFAULT true NOT NULL,
	"sender_name" text,
	"is_read" boolean DEFAULT false NOT NULL,
	"photo_url" text,
	"telegram_message_id" integer,
	"max_mid" text,
	"edited_at" timestamp,
	"updated_by_user_id" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE "master_tasks" (
	"id" serial PRIMARY KEY NOT NULL,
	"master_id" integer NOT NULL,
	"text" text NOT NULL,
	"due_at" timestamp,
	"is_completed" boolean DEFAULT false NOT NULL,
	"created_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE "master_reviews" (
	"id" serial PRIMARY KEY NOT NULL,
	"master_id" integer NOT NULL,
	"order_id" integer,
	"sentiment" text DEFAULT 'neutral' NOT NULL,
	"text" text NOT NULL,
	"created_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE "system_tasks" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"type" "task_type" DEFAULT 'manual' NOT NULL,
	"status" "task_status" DEFAULT 'open' NOT NULL,
	"priority" "task_priority" DEFAULT 'medium' NOT NULL,
	"category" "task_category" DEFAULT 'general' NOT NULL,
	"assigned_to" text,
	"related_master_id" integer,
	"related_order_id" integer,
	"due_at" timestamp,
	"completed_at" timestamp,
	"completed_by" text,
	"ai_reason" text,
	"created_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE "push_subscriptions" (
	"id" serial PRIMARY KEY NOT NULL,
	"master_id" integer NOT NULL,
	"endpoint" text NOT NULL,
	"p256dh" text NOT NULL,
	"auth" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "push_subscriptions_endpoint_unique" UNIQUE("endpoint")
);

CREATE TABLE "order_status_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"order_id" integer NOT NULL,
	"old_status" text,
	"new_status" text NOT NULL,
	"user_id" integer,
	"user_alias" text,
	"note" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE "receipts" (
	"id" serial PRIMARY KEY NOT NULL,
	"token" varchar(64) NOT NULL,
	"order_id" integer NOT NULL,
	"master_id" integer NOT NULL,
	"client_name" text NOT NULL,
	"client_phone" text NOT NULL,
	"service_type" text NOT NULL,
	"city" text NOT NULL,
	"district" text,
	"line_items" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"total_amount" numeric(10, 2) NOT NULL,
	"prepayment_amount" numeric(10, 2) NOT NULL,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"client_submitted_name" text,
	"prepayment_submitted_at" timestamp,
	"prepayment_screenshot_url" text,
	"prepayment_seen_at" timestamp,
	CONSTRAINT "receipts_token_key" UNIQUE("token")
);

CREATE TABLE "max_bot_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"master_id" integer,
	"max_user_id" varchar(50),
	"event" varchar(100) NOT NULL,
	"note" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE "master_checkins" (
	"id" serial PRIMARY KEY NOT NULL,
	"master_id" integer NOT NULL,
	"date" date NOT NULL,
	"is_available" boolean,
	"reason" text,
	"responded_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "master_checkins_master_id_date_key" UNIQUE("master_id","date")
);

CREATE TABLE "scenario_notifications" (
	"id" serial PRIMARY KEY NOT NULL,
	"scenario_id" varchar(64) NOT NULL,
	"order_id" integer NOT NULL,
	"master_id" integer NOT NULL,
	"tier" varchar(32) NOT NULL,
	"sent_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE "scenario_runs" (
	"id" serial PRIMARY KEY NOT NULL,
	"scenario" text NOT NULL,
	"run_type" text DEFAULT 'manual' NOT NULL,
	"status" text DEFAULT 'running' NOT NULL,
	"summary" jsonb,
	"error_text" text,
	"duration_ms" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE "order_broadcast_waves" (
	"id" serial PRIMARY KEY NOT NULL,
	"order_id" integer NOT NULL,
	"current_wave" integer DEFAULT 1 NOT NULL,
	"wave_1_sent_at" timestamp,
	"wave_2_sent_at" timestamp,
	"wave_3_sent_at" timestamp,
	"wave_4_sent_at" timestamp,
	"admin_alerted_at" timestamp,
	"wave_1_count" integer DEFAULT 0 NOT NULL,
	"wave_2_count" integer DEFAULT 0 NOT NULL,
	"wave_3_count" integer DEFAULT 0 NOT NULL,
	"wave_4_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "order_broadcast_waves_order_id_unique" UNIQUE("order_id")
);

CREATE TABLE "user_sessions" (
	"sid" varchar PRIMARY KEY NOT NULL,
	"sess" json NOT NULL,
	"expire" timestamp (6) NOT NULL
);

CREATE TABLE "task_snoozes" (
	"id" serial PRIMARY KEY NOT NULL,
	"item_id" text NOT NULL,
	"snoozed_until" timestamp NOT NULL,
	"snoozed_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "task_snoozes_item_id_unique" UNIQUE("item_id")
);

CREATE TABLE "operator_push_subscriptions" (
	"id" serial PRIMARY KEY NOT NULL,
	"operator_id" text NOT NULL,
	"endpoint" text NOT NULL,
	"p256dh" text NOT NULL,
	"auth" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "operator_push_subscriptions_endpoint_unique" UNIQUE("endpoint")
);

CREATE TABLE "order_master_history" (
	"id" serial PRIMARY KEY NOT NULL,
	"order_id" integer NOT NULL,
	"master_id" integer NOT NULL,
	"status" text NOT NULL,
	"assigned_at" timestamp,
	"removed_at" timestamp DEFAULT now() NOT NULL,
	"cancel_reason" text,
	"order_amount" numeric,
	"service_type" text,
	"city" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE "order_masters" (
	"id" serial PRIMARY KEY NOT NULL,
	"order_id" integer NOT NULL,
	"master_id" integer NOT NULL,
	"assigned_at" timestamp DEFAULT now() NOT NULL,
	"tokens_charged" integer DEFAULT 0 NOT NULL,
	"status" varchar(20) DEFAULT 'active' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE "token_packages" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(255) NOT NULL,
	"tokens_count" numeric(10, 2) NOT NULL,
	"price_rub" integer NOT NULL,
	"price_per_token" numeric(10, 2) NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE "service_token_prices" (
	"id" serial PRIMARY KEY NOT NULL,
	"service_name" varchar(255) NOT NULL,
	"service_key" varchar(100) NOT NULL,
	"tokens_cost" numeric(10, 2) NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "service_token_prices_service_key_unique" UNIQUE("service_key")
);

CREATE TABLE "service_token_rules" (
	"id" serial PRIMARY KEY NOT NULL,
	"service_key" varchar(100) NOT NULL,
	"title" varchar(255) NOT NULL,
	"calc_type" varchar(50) DEFAULT 'fixed' NOT NULL,
	"min_area" numeric(10, 2),
	"max_area" numeric(10, 2),
	"tokens_cost" numeric(10, 2) NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE "master_wallet" (
	"id" serial PRIMARY KEY NOT NULL,
	"master_id" integer NOT NULL,
	"tokens_balance" numeric(10, 2) DEFAULT '0' NOT NULL,
	"total_tokens_purchased" numeric(10, 2) DEFAULT '0' NOT NULL,
	"total_tokens_spent" numeric(10, 2) DEFAULT '0' NOT NULL,
	"total_tokens_refunded" numeric(10, 2) DEFAULT '0' NOT NULL,
	"total_rub_spent" integer DEFAULT 0 NOT NULL,
	"credit_tokens_issued" numeric(10, 2) DEFAULT '0' NOT NULL,
	"credit_tokens_spent" numeric(10, 2) DEFAULT '0' NOT NULL,
	"credit_limit_tokens" numeric(10, 2) DEFAULT '0' NOT NULL,
	"balance" numeric(10, 2) DEFAULT '0' NOT NULL,
	"credit_limit" numeric(10, 2) DEFAULT '0' NOT NULL,
	"total_service_fees_spent" numeric(10, 2) DEFAULT '0' NOT NULL,
	"total_topups" numeric(10, 2) DEFAULT '0' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "master_wallet_master_id_unique" UNIQUE("master_id")
);

CREATE TABLE "wallet_transactions" (
	"id" serial PRIMARY KEY NOT NULL,
	"master_id" integer NOT NULL,
	"type" varchar(50) NOT NULL,
	"tokens_amount" numeric(10, 2) NOT NULL,
	"rub_amount" integer,
	"package_id" integer,
	"order_id" integer,
	"reason" text,
	"screenshot_url" text,
	"created_by" varchar(100) DEFAULT 'system' NOT NULL,
	"status" varchar(50) DEFAULT 'completed' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE "token_audit_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"master_id" integer NOT NULL,
	"order_id" integer,
	"type" varchar(50) NOT NULL,
	"tokens_amount" numeric(10, 2) NOT NULL,
	"balance_before" numeric(10, 2) NOT NULL,
	"balance_after" numeric(10, 2) NOT NULL,
	"reason" text,
	"created_by" varchar(100) DEFAULT 'system' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE "token_price_history" (
	"id" serial PRIMARY KEY NOT NULL,
	"entity_type" varchar(50) NOT NULL,
	"entity_id" integer NOT NULL,
	"field_name" varchar(100) NOT NULL,
	"old_value" text,
	"new_value" text,
	"changed_by" varchar(100) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE "traffic_partners" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer,
	"name" varchar(255) NOT NULL,
	"phone" varchar(50) NOT NULL,
	"city" varchar(100) NOT NULL,
	"status" varchar(50) DEFAULT 'active' NOT NULL,
	"avito_account_name" varchar(255),
	"avito_account_link" varchar(500),
	"ref_slug" varchar(100),
	"notes" text,
	"registered_at" timestamp DEFAULT now() NOT NULL,
	"first_lead_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "traffic_partners_ref_slug_unique" UNIQUE("ref_slug")
);

CREATE TABLE "partner_billing_periods" (
	"id" serial PRIMARY KEY NOT NULL,
	"partner_id" integer NOT NULL,
	"period_start" date NOT NULL,
	"period_end" date NOT NULL,
	"is_first_period" boolean DEFAULT false NOT NULL,
	"days_in_period" integer NOT NULL,
	"leads_count" integer DEFAULT 0 NOT NULL,
	"valid_leads_count" integer DEFAULT 0 NOT NULL,
	"token_spent_count" integer DEFAULT 0 NOT NULL,
	"fixed_pct" numeric(5, 4) DEFAULT '0' NOT NULL,
	"fixed_salary_base" numeric(10, 2) DEFAULT '0' NOT NULL,
	"fixed_salary_earned" numeric(10, 2) DEFAULT '0' NOT NULL,
	"bonus_per_lead" integer DEFAULT 250 NOT NULL,
	"bonus_earned" numeric(10, 2) DEFAULT '0' NOT NULL,
	"total_earned" numeric(10, 2) DEFAULT '0' NOT NULL,
	"hold_leads_count" integer DEFAULT 0 NOT NULL,
	"hold_earned" numeric(10, 2) DEFAULT '0' NOT NULL,
	"ad_budget" numeric(10, 2) DEFAULT '0' NOT NULL,
	"status" varchar(50) DEFAULT 'calculating' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"paid_at" timestamp
);

CREATE TABLE "partner_push_subscriptions" (
	"id" serial PRIMARY KEY NOT NULL,
	"partner_id" integer NOT NULL,
	"endpoint" text NOT NULL,
	"p256dh" text NOT NULL,
	"auth" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "partner_push_subscriptions_endpoint_unique" UNIQUE("endpoint")
);

CREATE TABLE "browser_agent_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"agent_id" integer,
	"session_id" varchar(255),
	"action_type" varchar(100),
	"description" text,
	"screenshot_b64" text,
	"level" varchar(20),
	"message" text,
	"data" jsonb,
	"created_at" timestamp DEFAULT now()
);

CREATE TABLE "lead_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"lead_id" integer,
	"event_type" varchar(100),
	"description" text,
	"user_alias" varchar(255),
	"data" jsonb,
	"created_at" timestamp DEFAULT now()
);

CREATE TABLE "scenario_settings" (
	"scenario" varchar(255) PRIMARY KEY NOT NULL,
	"auto_enabled" varchar(10),
	"updated_at" timestamp DEFAULT now()
);

CREATE TABLE "sessions" (
	"sid" varchar PRIMARY KEY NOT NULL,
	"sess" json NOT NULL,
	"expire" timestamp (6) NOT NULL
);

CREATE TABLE "master_active_packages" (
	"id" serial PRIMARY KEY NOT NULL,
	"master_id" integer NOT NULL,
	"package_type" varchar(20) DEFAULT 'paid' NOT NULL,
	"tokens_total" numeric(10, 2) DEFAULT '0' NOT NULL,
	"tokens_remaining" numeric(10, 2) DEFAULT '0' NOT NULL,
	"expires_at" timestamp NOT NULL,
	"status" varchar(20) DEFAULT 'active' NOT NULL,
	"is_debt_paid" boolean DEFAULT true NOT NULL,
	"transaction_id" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE "ml_pricing_decisions" (
	"id" serial PRIMARY KEY NOT NULL,
	"order_id" integer NOT NULL,
	"master_id" integer,
	"tokens_charged" numeric(10, 2) NOT NULL,
	"max_masters" integer NOT NULL,
	"assigned_count" integer NOT NULL,
	"service_type" text,
	"city" text,
	"district" text,
	"area" numeric(10, 2),
	"scheduled_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"hour_of_day" integer,
	"is_weekend" boolean,
	"master_rating" numeric(3, 2),
	"master_experience" integer
);

CREATE TABLE "master_deposits" (
	"id" serial PRIMARY KEY NOT NULL,
	"master_id" integer NOT NULL,
	"deposit_balance" numeric(12, 2) DEFAULT '0' NOT NULL,
	"recommended_amount" integer DEFAULT 10000 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE "service_fee_transactions" (
	"id" serial PRIMARY KEY NOT NULL,
	"master_id" integer NOT NULL,
	"order_id" integer,
	"amount" numeric(10, 2) DEFAULT '0' NOT NULL,
	"type" text NOT NULL,
	"reason" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE "order_stages" (
	"id" serial PRIMARY KEY NOT NULL,
	"order_id" integer NOT NULL,
	"stage_name" text NOT NULL,
	"stage_amount" numeric(12, 2) NOT NULL,
	"commission_amount" numeric(12, 2) NOT NULL,
	"payment_status" "order_stage_status" DEFAULT 'pending' NOT NULL,
	"paid_at" timestamp,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE "master_test_orders" (
	"id" serial PRIMARY KEY NOT NULL,
	"master_id" integer NOT NULL,
	"order_id" integer NOT NULL,
	"is_test" boolean DEFAULT true NOT NULL,
	"used_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE "master_deposit_transactions" (
	"id" serial PRIMARY KEY NOT NULL,
	"master_id" integer NOT NULL,
	"type" varchar(20) NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"balance_before" numeric(12, 2) NOT NULL,
	"balance_after" numeric(12, 2) NOT NULL,
	"reason" text,
	"created_by" varchar(100) DEFAULT 'system' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);

ALTER TABLE "balance_topup_requests" ADD CONSTRAINT "balance_topup_requests_master_id_masters_id_fk" FOREIGN KEY ("master_id") REFERENCES "public"."masters"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "bot_memory" ADD CONSTRAINT "bot_memory_master_id_masters_id_fk" FOREIGN KEY ("master_id") REFERENCES "public"."masters"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "dispatch_resend_logs" ADD CONSTRAINT "dispatch_resend_logs_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "dispatch_resend_logs" ADD CONSTRAINT "dispatch_resend_logs_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "orders" ADD CONSTRAINT "orders_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "orders" ADD CONSTRAINT "orders_master_id_masters_id_fk" FOREIGN KEY ("master_id") REFERENCES "public"."masters"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "order_dispatches" ADD CONSTRAINT "order_dispatches_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "order_dispatches" ADD CONSTRAINT "order_dispatches_master_id_masters_id_fk" FOREIGN KEY ("master_id") REFERENCES "public"."masters"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_master_id_masters_id_fk" FOREIGN KEY ("master_id") REFERENCES "public"."masters"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "transaction_payments" ADD CONSTRAINT "transaction_payments_transaction_id_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."transactions"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "master_messages" ADD CONSTRAINT "master_messages_master_id_masters_id_fk" FOREIGN KEY ("master_id") REFERENCES "public"."masters"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "master_messages" ADD CONSTRAINT "master_messages_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "master_tasks" ADD CONSTRAINT "master_tasks_master_id_masters_id_fk" FOREIGN KEY ("master_id") REFERENCES "public"."masters"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "master_reviews" ADD CONSTRAINT "master_reviews_master_id_masters_id_fk" FOREIGN KEY ("master_id") REFERENCES "public"."masters"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "master_reviews" ADD CONSTRAINT "master_reviews_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "system_tasks" ADD CONSTRAINT "system_tasks_related_master_id_masters_id_fk" FOREIGN KEY ("related_master_id") REFERENCES "public"."masters"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "system_tasks" ADD CONSTRAINT "system_tasks_related_order_id_orders_id_fk" FOREIGN KEY ("related_order_id") REFERENCES "public"."orders"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_master_id_masters_id_fk" FOREIGN KEY ("master_id") REFERENCES "public"."masters"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "order_status_logs" ADD CONSTRAINT "order_status_logs_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_master_id_masters_id_fk" FOREIGN KEY ("master_id") REFERENCES "public"."masters"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "master_checkins" ADD CONSTRAINT "master_checkins_master_id_masters_id_fk" FOREIGN KEY ("master_id") REFERENCES "public"."masters"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "order_master_history" ADD CONSTRAINT "order_master_history_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "order_master_history" ADD CONSTRAINT "order_master_history_master_id_masters_id_fk" FOREIGN KEY ("master_id") REFERENCES "public"."masters"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "order_masters" ADD CONSTRAINT "order_masters_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "order_masters" ADD CONSTRAINT "order_masters_master_id_masters_id_fk" FOREIGN KEY ("master_id") REFERENCES "public"."masters"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "master_wallet" ADD CONSTRAINT "master_wallet_master_id_masters_id_fk" FOREIGN KEY ("master_id") REFERENCES "public"."masters"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "wallet_transactions" ADD CONSTRAINT "wallet_transactions_master_id_masters_id_fk" FOREIGN KEY ("master_id") REFERENCES "public"."masters"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "wallet_transactions" ADD CONSTRAINT "wallet_transactions_package_id_token_packages_id_fk" FOREIGN KEY ("package_id") REFERENCES "public"."token_packages"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "wallet_transactions" ADD CONSTRAINT "wallet_transactions_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "token_audit_log" ADD CONSTRAINT "token_audit_log_master_id_masters_id_fk" FOREIGN KEY ("master_id") REFERENCES "public"."masters"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "token_audit_log" ADD CONSTRAINT "token_audit_log_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "traffic_partners" ADD CONSTRAINT "traffic_partners_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "partner_billing_periods" ADD CONSTRAINT "partner_billing_periods_partner_id_traffic_partners_id_fk" FOREIGN KEY ("partner_id") REFERENCES "public"."traffic_partners"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "partner_push_subscriptions" ADD CONSTRAINT "partner_push_subscriptions_partner_id_traffic_partners_id_fk" FOREIGN KEY ("partner_id") REFERENCES "public"."traffic_partners"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "master_active_packages" ADD CONSTRAINT "master_active_packages_master_id_masters_id_fk" FOREIGN KEY ("master_id") REFERENCES "public"."masters"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "ml_pricing_decisions" ADD CONSTRAINT "ml_pricing_decisions_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "ml_pricing_decisions" ADD CONSTRAINT "ml_pricing_decisions_master_id_masters_id_fk" FOREIGN KEY ("master_id") REFERENCES "public"."masters"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "master_deposits" ADD CONSTRAINT "master_deposits_master_id_masters_id_fk" FOREIGN KEY ("master_id") REFERENCES "public"."masters"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "service_fee_transactions" ADD CONSTRAINT "service_fee_transactions_master_id_masters_id_fk" FOREIGN KEY ("master_id") REFERENCES "public"."masters"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "service_fee_transactions" ADD CONSTRAINT "service_fee_transactions_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "order_stages" ADD CONSTRAINT "order_stages_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "master_test_orders" ADD CONSTRAINT "master_test_orders_master_id_masters_id_fk" FOREIGN KEY ("master_id") REFERENCES "public"."masters"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "master_test_orders" ADD CONSTRAINT "master_test_orders_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "master_deposit_transactions" ADD CONSTRAINT "master_deposit_transactions_master_id_masters_id_fk" FOREIGN KEY ("master_id") REFERENCES "public"."masters"("id") ON DELETE cascade ON UPDATE no action;
CREATE INDEX "client_push_phone_idx" ON "client_push_subscriptions" USING btree ("phone");
CREATE INDEX "fomo_events_master_id_idx" ON "fomo_events" USING btree ("master_id");
CREATE INDEX "fomo_events_event_type_idx" ON "fomo_events" USING btree ("event_type");
CREATE INDEX "fomo_events_created_at_idx" ON "fomo_events" USING btree ("created_at");
CREATE INDEX "leads_status_active_idx" ON "leads" USING btree ("status","deleted_at","created_at");
CREATE INDEX "leads_phone_idx" ON "leads" USING btree ("client_phone");
CREATE INDEX "orders_status_active_idx" ON "orders" USING btree ("status","deleted_at","last_broadcast_at");
CREATE INDEX "orders_lead_id_idx" ON "orders" USING btree ("lead_id");
CREATE INDEX "orders_master_status_idx" ON "orders" USING btree ("master_id","status","deleted_at");
CREATE INDEX "orders_completed_at_idx" ON "orders" USING btree ("completed_at");
CREATE INDEX "orders_payment_model_idx" ON "orders" USING btree ("payment_model");
CREATE INDEX "master_messages_master_id_idx" ON "master_messages" USING btree ("master_id");
CREATE INDEX "master_messages_from_master_read_idx" ON "master_messages" USING btree ("from_master","is_read");
CREATE INDEX "master_messages_created_at_idx" ON "master_messages" USING btree ("created_at");
CREATE INDEX "master_messages_telegram_chat_id_idx" ON "master_messages" USING btree ("telegram_chat_id");
CREATE INDEX "receipts_pending_confirm_idx" ON "receipts" USING btree ("prepayment_submitted_at","prepayment_seen_at");
CREATE INDEX "receipts_order_id_idx" ON "receipts" USING btree ("order_id");
CREATE INDEX "partner_push_partner_idx" ON "partner_push_subscriptions" USING btree ("partner_id");