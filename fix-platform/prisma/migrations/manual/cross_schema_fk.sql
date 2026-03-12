-- Cross-schema foreign key: platform."PlatformUser" -> public."User"
--
-- Prisma cannot automatically generate cross-schema FK constraints.
-- This migration must be applied manually via scripts/run-manual-migrations.sh.
--
-- Idempotent: safe to run multiple times. If the constraint already exists,
-- the EXCEPTION handler silently ignores the duplicate_object error.

DO $$
BEGIN
  ALTER TABLE platform."PlatformUser"
    ADD CONSTRAINT fk_platform_user_user
    FOREIGN KEY ("userId")
    REFERENCES public."User"(id);
EXCEPTION
  WHEN duplicate_object THEN
    NULL;
END $$;
