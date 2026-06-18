CREATE TYPE "public"."housing_type" AS ENUM('novostroyka', 'vtorichka', 'chastnyy_dom', 'kommerciya');
ALTER TABLE "master_portfolio" ADD COLUMN "duration_days" integer;
ALTER TABLE "master_portfolio" ADD COLUMN "housing_type" "housing_type";
ALTER TABLE "master_portfolio" ADD COLUMN "estimate" jsonb;