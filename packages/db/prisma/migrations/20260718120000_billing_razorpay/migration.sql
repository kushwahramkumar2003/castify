-- CreateEnum
CREATE TYPE "BillingSubStatus" AS ENUM (
  'CREATED',
  'AUTHENTICATED',
  'ACTIVE',
  'PENDING',
  'HALTED',
  'PAUSED',
  'CANCELLED',
  'COMPLETED',
  'EXPIRED'
);

-- AlterTable
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "razorpayCustomerId" VARCHAR(64);

-- CreateTable
CREATE TABLE "billing_plans" (
    "id" UUID NOT NULL,
    "tier" "PlanTier" NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "amountPaise" INTEGER NOT NULL,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'INR',
    "period" VARCHAR(20) NOT NULL DEFAULT 'monthly',
    "interval" INTEGER NOT NULL DEFAULT 1,
    "razorpayPlanId" VARCHAR(64) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "billing_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "billing_subscriptions" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "billingPlanId" UUID NOT NULL,
    "tier" "PlanTier" NOT NULL,
    "status" "BillingSubStatus" NOT NULL DEFAULT 'CREATED',
    "razorpaySubscriptionId" VARCHAR(64) NOT NULL,
    "razorpayCustomerId" VARCHAR(64),
    "currentStart" TIMESTAMP(3),
    "currentEnd" TIMESTAMP(3),
    "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
    "rawLastPayload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "billing_subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "billing_payments" (
    "id" UUID NOT NULL,
    "billingSubscriptionId" UUID NOT NULL,
    "razorpayPaymentId" VARCHAR(64) NOT NULL,
    "amountPaise" INTEGER NOT NULL,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'INR',
    "status" VARCHAR(32) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "billing_payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "billing_webhook_events" (
    "id" UUID NOT NULL,
    "eventId" VARCHAR(64) NOT NULL,
    "eventType" VARCHAR(80) NOT NULL,
    "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "billing_webhook_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "billing_plans_tier_key" ON "billing_plans"("tier");

-- CreateIndex
CREATE UNIQUE INDEX "billing_plans_razorpayPlanId_key" ON "billing_plans"("razorpayPlanId");

-- CreateIndex
CREATE UNIQUE INDEX "billing_subscriptions_razorpaySubscriptionId_key" ON "billing_subscriptions"("razorpaySubscriptionId");

-- CreateIndex
CREATE INDEX "billing_subscriptions_userId_status_idx" ON "billing_subscriptions"("userId", "status");

-- CreateIndex
CREATE INDEX "billing_subscriptions_status_idx" ON "billing_subscriptions"("status");

-- CreateIndex
CREATE UNIQUE INDEX "billing_payments_razorpayPaymentId_key" ON "billing_payments"("razorpayPaymentId");

-- CreateIndex
CREATE INDEX "billing_payments_billingSubscriptionId_idx" ON "billing_payments"("billingSubscriptionId");

-- CreateIndex
CREATE UNIQUE INDEX "billing_webhook_events_eventId_key" ON "billing_webhook_events"("eventId");

-- AddForeignKey
ALTER TABLE "billing_subscriptions" ADD CONSTRAINT "billing_subscriptions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "billing_subscriptions" ADD CONSTRAINT "billing_subscriptions_billingPlanId_fkey" FOREIGN KEY ("billingPlanId") REFERENCES "billing_plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "billing_payments" ADD CONSTRAINT "billing_payments_billingSubscriptionId_fkey" FOREIGN KEY ("billingSubscriptionId") REFERENCES "billing_subscriptions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
