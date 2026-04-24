-- Enforce domain invariants at the database layer so booking concurrency
-- can't drive credit balances or pack remainders negative even if the
-- application logic has a bug.

ALTER TABLE "Member"
  ADD CONSTRAINT "Member_credits_nonneg" CHECK (credits >= 0);

ALTER TABLE "CreditPack"
  ADD CONSTRAINT "CreditPack_remaining_nonneg" CHECK ("remainingCredits" >= 0),
  ADD CONSTRAINT "CreditPack_amount_positive" CHECK (amount > 0);

ALTER TABLE "Class"
  ADD CONSTRAINT "Class_capacity_positive" CHECK (capacity > 0),
  ADD CONSTRAINT "Class_duration_positive" CHECK ("durationMinutes" > 0),
  ADD CONSTRAINT "Class_credit_cost_nonneg" CHECK ("creditCost" >= 0);

-- One live booking per (class, member). Cancelled/no-show rows don't count
-- so members can re-book after a cancel.
CREATE UNIQUE INDEX "Booking_class_member_active_unique"
  ON "Booking" ("classId", "memberId")
  WHERE status IN ('ACTIVE', 'PROMOTED', 'WAITLISTED', 'CHECKED_IN');
