-- AlterTable
ALTER TABLE "subscriptions" ADD COLUMN "expiry_reminder_sent_at" TIMESTAMP(3),
ADD COLUMN "subscription_ended_notified_at" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "subscriptions_expiry_reminder_sent_at_idx" ON "subscriptions"("expiry_reminder_sent_at");

-- CreateIndex
CREATE INDEX "subscriptions_subscription_ended_notified_at_idx" ON "subscriptions"("subscription_ended_notified_at");
