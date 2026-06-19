CREATE TABLE "user_saves" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"anon_id" uuid,
	"user_id" integer,
	"portfolio_id" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);

ALTER TABLE "master_portfolio" ADD COLUMN "save_count" integer DEFAULT 0 NOT NULL;
ALTER TABLE "user_saves" ADD CONSTRAINT "user_saves_portfolio_id_master_portfolio_id_fk" FOREIGN KEY ("portfolio_id") REFERENCES "public"."master_portfolio"("id") ON DELETE cascade ON UPDATE no action;
CREATE INDEX "user_saves_anon_id_idx" ON "user_saves" USING btree ("anon_id");
CREATE INDEX "user_saves_user_id_idx" ON "user_saves" USING btree ("user_id");
CREATE INDEX "user_saves_portfolio_id_idx" ON "user_saves" USING btree ("portfolio_id");
CREATE UNIQUE INDEX "user_saves_anon_portfolio_uniq" ON "user_saves" USING btree ("anon_id","portfolio_id") WHERE "user_saves"."anon_id" IS NOT NULL;
CREATE UNIQUE INDEX "user_saves_user_portfolio_uniq" ON "user_saves" USING btree ("user_id","portfolio_id") WHERE "user_saves"."user_id" IS NOT NULL;