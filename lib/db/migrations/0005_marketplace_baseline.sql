CREATE TABLE "master_portfolio" (
	"id" serial PRIMARY KEY NOT NULL,
	"master_id" integer NOT NULL,
	"service_type_id" integer,
	"city_id" integer,
	"title" varchar(150) NOT NULL,
	"slug" varchar(150),
	"description" text,
	"before_photos" text[] DEFAULT '{}' NOT NULL,
	"after_photos" text[] DEFAULT '{}' NOT NULL,
	"price_from" numeric(10, 2),
	"price_to" numeric(10, 2),
	"area" numeric(10, 2),
	"completed_at" timestamp,
	"client_review_text" text,
	"client_rating" integer,
	"is_published" boolean DEFAULT false NOT NULL,
	"is_featured" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"view_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "master_portfolio_slug_key" UNIQUE("slug")
);

CREATE TABLE "master_reviews_public" (
	"id" serial PRIMARY KEY NOT NULL,
	"master_id" integer NOT NULL,
	"order_id" integer,
	"client_name" varchar(150) NOT NULL,
	"client_phone_hash" varchar(64),
	"client_city" varchar(100),
	"rating" integer NOT NULL,
	"text" text NOT NULL,
	"photos" text[] DEFAULT '{}' NOT NULL,
	"moderation_status" varchar(20) DEFAULT 'pending' NOT NULL,
	"moderated_by" integer,
	"moderated_at" timestamp,
	"moderation_note" text,
	"is_featured" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE "seo_redirects" (
	"id" serial PRIMARY KEY NOT NULL,
	"from_path" varchar(500) NOT NULL,
	"to_path" varchar(500) NOT NULL,
	"status_code" integer DEFAULT 301 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"note" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"created_by" integer,
	CONSTRAINT "seo_redirects_from_path_key" UNIQUE("from_path")
);

ALTER TABLE "leads" ADD COLUMN "source_page_url" text;
ALTER TABLE "leads" ADD COLUMN "source_page_type" varchar(40);
ALTER TABLE "leads" ADD COLUMN "service_slug" varchar(100);
ALTER TABLE "leads" ADD COLUMN "city_slug" varchar(100);
ALTER TABLE "leads" ADD COLUMN "marketplace_context" jsonb;
ALTER TABLE "leads" ADD COLUMN "referrer" text;
ALTER TABLE "leads" ADD COLUMN "utm_source" varchar(100);
ALTER TABLE "leads" ADD COLUMN "utm_medium" varchar(100);
ALTER TABLE "leads" ADD COLUMN "utm_campaign" varchar(100);
ALTER TABLE "leads" ADD COLUMN "utm_term" varchar(200);
ALTER TABLE "leads" ADD COLUMN "utm_content" varchar(200);
ALTER TABLE "leads" ADD COLUMN "attached_master_id" integer;
ALTER TABLE "leads" ADD COLUMN "client_ip" varchar(45);
ALTER TABLE "leads" ADD COLUMN "client_user_agent" text;
ALTER TABLE "leads" ADD COLUMN "consent_given_at" timestamp;
ALTER TABLE "leads" ADD COLUMN "captcha_score" numeric(3, 2);
ALTER TABLE "masters" ADD COLUMN "slug" varchar(100);
ALTER TABLE "masters" ADD COLUMN "is_published" boolean DEFAULT false NOT NULL;
ALTER TABLE "masters" ADD COLUMN "published_at" timestamp;
ALTER TABLE "masters" ADD COLUMN "public_title" varchar(150);
ALTER TABLE "masters" ADD COLUMN "public_bio" text;
ALTER TABLE "masters" ADD COLUMN "seo_title" varchar(70);
ALTER TABLE "masters" ADD COLUMN "seo_description" varchar(180);
ALTER TABLE "masters" ADD COLUMN "years_experience" integer;
ALTER TABLE "masters" ADD COLUMN "public_rating" numeric(3, 2);
ALTER TABLE "masters" ADD COLUMN "public_reviews_count" integer DEFAULT 0 NOT NULL;
ALTER TABLE "cities" ADD COLUMN "slug" varchar(100);
ALTER TABLE "cities" ADD COLUMN "name_in" varchar(100);
ALTER TABLE "cities" ADD COLUMN "region" varchar(100);
ALTER TABLE "cities" ADD COLUMN "timezone" varchar(50) DEFAULT 'Europe/Moscow';
ALTER TABLE "cities" ADD COLUMN "lat" numeric(9, 6);
ALTER TABLE "cities" ADD COLUMN "lng" numeric(9, 6);
ALTER TABLE "cities" ADD COLUMN "population" integer;
ALTER TABLE "cities" ADD COLUMN "seo_title" varchar(70);
ALTER TABLE "cities" ADD COLUMN "seo_description" varchar(180);
ALTER TABLE "cities" ADD COLUMN "h1" varchar(100);
ALTER TABLE "cities" ADD COLUMN "body_md" text;
ALTER TABLE "cities" ADD COLUMN "is_active" boolean DEFAULT true NOT NULL;
ALTER TABLE "service_types" ADD COLUMN "slug" varchar(100);
ALTER TABLE "service_types" ADD COLUMN "name_genitive" varchar(255);
ALTER TABLE "service_types" ADD COLUMN "parent_id" integer;
ALTER TABLE "service_types" ADD COLUMN "icon" varchar(50);
ALTER TABLE "service_types" ADD COLUMN "description" text;
ALTER TABLE "service_types" ADD COLUMN "body_md" text;
ALTER TABLE "service_types" ADD COLUMN "seo_title" varchar(70);
ALTER TABLE "service_types" ADD COLUMN "seo_description" varchar(180);
ALTER TABLE "service_types" ADD COLUMN "h1" varchar(100);
ALTER TABLE "service_types" ADD COLUMN "price_from" integer;
ALTER TABLE "service_types" ADD COLUMN "is_active" boolean DEFAULT true NOT NULL;
ALTER TABLE "service_types" ADD COLUMN "sort_order" integer DEFAULT 0 NOT NULL;
ALTER TABLE "master_portfolio" ADD CONSTRAINT "master_portfolio_master_id_masters_id_fk" FOREIGN KEY ("master_id") REFERENCES "public"."masters"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "master_portfolio" ADD CONSTRAINT "master_portfolio_service_type_id_service_types_id_fk" FOREIGN KEY ("service_type_id") REFERENCES "public"."service_types"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "master_portfolio" ADD CONSTRAINT "master_portfolio_city_id_cities_id_fk" FOREIGN KEY ("city_id") REFERENCES "public"."cities"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "master_reviews_public" ADD CONSTRAINT "master_reviews_public_master_id_masters_id_fk" FOREIGN KEY ("master_id") REFERENCES "public"."masters"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "master_reviews_public" ADD CONSTRAINT "master_reviews_public_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "master_reviews_public" ADD CONSTRAINT "master_reviews_public_moderated_by_users_id_fk" FOREIGN KEY ("moderated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "seo_redirects" ADD CONSTRAINT "seo_redirects_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
CREATE INDEX "master_portfolio_master_published_idx" ON "master_portfolio" USING btree ("master_id","is_published");
CREATE INDEX "master_portfolio_published_featured_idx" ON "master_portfolio" USING btree ("is_published","is_featured","sort_order");
CREATE INDEX "master_reviews_public_master_approved_idx" ON "master_reviews_public" USING btree ("master_id","moderation_status");
CREATE INDEX "master_reviews_public_pending_idx" ON "master_reviews_public" USING btree ("moderation_status","created_at");
CREATE INDEX "seo_redirects_active_idx" ON "seo_redirects" USING btree ("is_active","from_path");
ALTER TABLE "leads" ADD CONSTRAINT "leads_attached_master_id_masters_id_fk" FOREIGN KEY ("attached_master_id") REFERENCES "public"."masters"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "service_types" ADD CONSTRAINT "service_types_parent_id_service_types_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."service_types"("id") ON DELETE set null ON UPDATE no action;
CREATE INDEX "leads_source_marketplace_idx" ON "leads" USING btree ("source");
CREATE INDEX "leads_attached_master_idx" ON "leads" USING btree ("attached_master_id");
ALTER TABLE "masters" ADD CONSTRAINT "masters_slug_key" UNIQUE("slug");
ALTER TABLE "cities" ADD CONSTRAINT "cities_slug_key" UNIQUE("slug");
ALTER TABLE "service_types" ADD CONSTRAINT "service_types_slug_key" UNIQUE("slug");
