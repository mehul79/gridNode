/*
  Warnings:

  - A unique constraint covering the columns `[userKey]` on the table `user` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "user" ADD COLUMN     "userKey" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "user_userKey_key" ON "user"("userKey");
