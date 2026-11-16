-- The support address is support@numnum.me. Fix it only where the old, wrong default was saved;
-- an address an admin chose on purpose is left alone.
UPDATE "platform_settings"
SET "value" = '"support@numnum.me"'::jsonb, "updatedAt" = now()
WHERE "key" = 'supportEmail' AND "value" = '"support@numnum.app"'::jsonb;
