-- The default commission is 8% (was 14%). Change it only where the old default is still saved;
-- a rate an admin chose on purpose, and each restaurant's own rate, are left alone. Commissions
-- already charged keep the rate they were charged at.
UPDATE "platform_settings"
SET "value" = '800'::jsonb, "updatedAt" = now()
WHERE "key" = 'defaultCommissionRateBps' AND "value" = '1400'::jsonb;
