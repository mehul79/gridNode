-- CreateEnum
CREATE TYPE "IsolationMode" AS ENUM ('gvisor', 'runc');

-- AlterTable
ALTER TABLE "Machine" ADD COLUMN     "isolationMode" "IsolationMode";
