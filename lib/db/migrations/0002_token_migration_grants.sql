CREATE TABLE "master_balance_grants" (
	"id" serial PRIMARY KEY NOT NULL,
	"master_id" integer NOT NULL,
	"amount" numeric(10, 2) NOT NULL,
	"reason" text,
	"applied_at" timestamp,
	"created_by" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);

ALTER TABLE "master_balance_grants" ADD CONSTRAINT "master_balance_grants_master_id_masters_id_fk" FOREIGN KEY ("master_id") REFERENCES "public"."masters"("id") ON DELETE no action ON UPDATE no action;
CREATE INDEX "master_balance_grants_master_idx" ON "master_balance_grants" USING btree ("master_id");
CREATE INDEX "master_balance_grants_applied_idx" ON "master_balance_grants" USING btree ("applied_at");