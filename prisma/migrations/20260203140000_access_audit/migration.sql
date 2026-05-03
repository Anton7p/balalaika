CREATE TABLE "access_audit_logs" (
    "id" TEXT NOT NULL,
    "actor_telegram_id" BIGINT,
    "user_id" TEXT,
    "action" TEXT NOT NULL,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "access_audit_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "access_audit_logs_user_id_idx" ON "access_audit_logs"("user_id");
CREATE INDEX "access_audit_logs_created_at_idx" ON "access_audit_logs"("created_at");
