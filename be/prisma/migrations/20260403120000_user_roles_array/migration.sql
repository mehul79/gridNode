-- Migration: user_roles_array
-- Created: 2026-04-03
-- Purpose: Change User.role from String to String[] (multiple roles)

-- 1. Add new roles column (array of text)
ALTER TABLE "user" ADD COLUMN "roles" TEXT[] NOT NULL DEFAULT ARRAY['requester'];

-- 2. Copy existing single role into the array
UPDATE "user" SET "roles" = ARRAY[role] WHERE role IS NOT NULL;

-- 3. Drop old role column
ALTER TABLE "user" DROP COLUMN "role";

-- Note: Default is kept as ARRAY['requester'] for new users
