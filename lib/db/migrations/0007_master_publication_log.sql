CREATE TABLE "master_publication_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"master_id" integer NOT NULL,
	"actor" varchar(20) NOT NULL,
	"actor_id" integer,
	"action" varchar(40) NOT NULL,
	"reason" text,
	"changes" jsonb,
	"ip" varchar(45),
	"created_at" timestamp DEFAULT now() NOT NULL
);

ALTER TABLE "master_publication_log" ADD CONSTRAINT "master_publication_log_master_id_masters_id_fk" FOREIGN KEY ("master_id") REFERENCES "public"."masters"("id") ON DELETE cascade ON UPDATE no action;