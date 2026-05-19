-- AlterTable
ALTER TABLE "users" ADD COLUMN "free_trial_used_at" TIMESTAMP(3);

UPDATE "users" u
SET "free_trial_used_at" = sub.min_at
FROM (
  SELECT "user_id", MIN("starts_at") AS min_at
  FROM "subscriptions"
  WHERE "plan_months" = 0
  GROUP BY "user_id"
) sub
WHERE u."id" = sub."user_id" AND u."free_trial_used_at" IS NULL;

UPDATE "users" u
SET "free_trial_used_at" = sub.min_at
FROM (
  SELECT "user_id", MIN("created_at") AS min_at
  FROM "access_audit_logs"
  WHERE "user_id" IS NOT NULL
    AND "action" IN ('vpn_subscription_issued', 'vpn_subscription_extended')
    AND ("metadata"->>'planMonths')::float = 0
  GROUP BY "user_id"
) sub
WHERE u."id" = sub."user_id" AND u."free_trial_used_at" IS NULL;
