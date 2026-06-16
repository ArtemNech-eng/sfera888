CREATE TABLE "design_generations" (
	"id" serial PRIMARY KEY NOT NULL,
	"design_id" integer,
	"provider" varchar(50) NOT NULL,
	"model" varchar(100),
	"prompt" text,
	"room_type" varchar(50),
	"style" varchar(50),
	"status" varchar(30) DEFAULT 'pending' NOT NULL,
	"cost_kopeks" integer,
	"error_message" text,
	"provider_response" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"completed_at" timestamp
);

CREATE TABLE "design_images" (
	"id" serial PRIMARY KEY NOT NULL,
	"design_id" integer NOT NULL,
	"type" varchar(30) NOT NULL,
	"url" text NOT NULL,
	"width" integer,
	"height" integer,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE "designs" (
	"id" serial PRIMARY KEY NOT NULL,
	"slug" varchar(160),
	"client_phone_hash" varchar(64),
	"room_type" varchar(50) NOT NULL,
	"style" varchar(50) NOT NULL,
	"city_id" integer,
	"district" varchar(100),
	"area" numeric(10, 2),
	"input_image_url" text,
	"result_image_url" text,
	"status" varchar(30) DEFAULT 'draft' NOT NULL,
	"is_public" boolean DEFAULT false NOT NULL,
	"public_consent_at" timestamp,
	"seo_title" varchar(120),
	"seo_description" varchar(220),
	"h1" varchar(160),
	"description" text,
	"estimated_price_from" numeric(10, 2),
	"estimated_price_to" numeric(10, 2),
	"view_count" integer DEFAULT 0 NOT NULL,
	"lead_id" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "designs_slug_key" UNIQUE("slug")
);

CREATE TABLE "user_design_limits" (
	"id" serial PRIMARY KEY NOT NULL,
	"identifier_hash" varchar(64) NOT NULL,
	"identifier_type" varchar(30) NOT NULL,
	"free_generations_used" integer DEFAULT 0 NOT NULL,
	"paid_generations_used" integer DEFAULT 0 NOT NULL,
	"reset_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);

ALTER TABLE "leads" ADD COLUMN "design_id" integer;
ALTER TABLE "design_generations" ADD CONSTRAINT "design_generations_design_id_designs_id_fk" FOREIGN KEY ("design_id") REFERENCES "public"."designs"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "design_images" ADD CONSTRAINT "design_images_design_id_designs_id_fk" FOREIGN KEY ("design_id") REFERENCES "public"."designs"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "designs" ADD CONSTRAINT "designs_city_id_cities_id_fk" FOREIGN KEY ("city_id") REFERENCES "public"."cities"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "designs" ADD CONSTRAINT "designs_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE set null ON UPDATE no action;
CREATE INDEX "design_generations_design_status_idx" ON "design_generations" USING btree ("design_id","status");
CREATE INDEX "design_images_design_type_idx" ON "design_images" USING btree ("design_id","type");
CREATE INDEX "designs_public_status_idx" ON "designs" USING btree ("is_public","status");
CREATE INDEX "designs_city_room_style_idx" ON "designs" USING btree ("city_id","room_type","style");
CREATE UNIQUE INDEX "user_design_limits_identifier_uniq" ON "user_design_limits" USING btree ("identifier_hash","identifier_type");
ALTER TABLE "leads" ADD CONSTRAINT "leads_design_id_designs_id_fk" FOREIGN KEY ("design_id") REFERENCES "public"."designs"("id") ON DELETE set null ON UPDATE no action;