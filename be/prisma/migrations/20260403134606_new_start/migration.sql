/*
  Warnings:

  - You are about to drop the column `cpuRequired` on the `Job` table. All the data in the column will be lost.
  - You are about to drop the column `datasetUri` on the `Job` table. All the data in the column will be lost.
  - You are about to drop the column `gpuRequired` on the `Job` table. All the data in the column will be lost.
  - You are about to drop the column `memoryRequired` on the `Job` table. All the data in the column will be lost.
  - You are about to drop the column `notebookPath` on the `Job` table. All the data in the column will be lost.
  - You are about to drop the column `timeoutSeconds` on the `Job` table. All the data in the column will be lost.
  - You are about to drop the column `roles` on the `user` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[userKey]` on the table `Machine` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `cpuTier` to the `Job` table without a default value. This is not possible if the table is not empty.
  - Added the required column `memoryTier` to the `Job` table without a default value. This is not possible if the table is not empty.
  - Made the column `command` on table `Job` required. This step will fail if there are existing NULL values in that column.

*/
-- CreateEnum
CREATE TYPE "GpuVendor" AS ENUM ('nvidia', 'amd', 'intel');

-- CreateEnum
CREATE TYPE "CpuTier" AS ENUM ('light', 'medium', 'heavy');

-- CreateEnum
CREATE TYPE "MemoryTier" AS ENUM ('gb8', 'gb16', 'gb32', 'gb64');

-- CreateEnum
CREATE TYPE "GpuMemoryTier" AS ENUM ('gb8', 'gb12', 'gb16', 'gb24', 'gb32', 'gb48');

-- CreateEnum
CREATE TYPE "DurationTier" AS ENUM ('lt1h', 'h1_6', 'h6_12', 'h12_24', 'gt24h');

-- AlterTable
ALTER TABLE "Job" DROP COLUMN "cpuRequired",
DROP COLUMN "datasetUri",
DROP COLUMN "gpuRequired",
DROP COLUMN "memoryRequired",
DROP COLUMN "notebookPath",
DROP COLUMN "timeoutSeconds",
ADD COLUMN     "cpuTier" "CpuTier" NOT NULL,
ADD COLUMN     "estimatedDuration" "DurationTier",
ADD COLUMN     "gpuMemoryTier" "GpuMemoryTier",
ADD COLUMN     "gpuVendor" "GpuVendor",
ADD COLUMN     "kaggleDatasetUrl" TEXT,
ADD COLUMN     "memoryTier" "MemoryTier" NOT NULL,
ALTER COLUMN "command" SET NOT NULL;

-- AlterTable
ALTER TABLE "Machine" ADD COLUMN     "gpuMemoryTotal" INTEGER,
ADD COLUMN     "gpuVendor" "GpuVendor",
ADD COLUMN     "userKey" TEXT;

-- AlterTable
ALTER TABLE "user" DROP COLUMN "roles";

-- CreateIndex
CREATE INDEX "Job_ownerId_idx" ON "Job"("ownerId");

-- CreateIndex
CREATE UNIQUE INDEX "Machine_userKey_key" ON "Machine"("userKey");

-- CreateIndex
CREATE INDEX "Machine_userKey_idx" ON "Machine"("userKey");
