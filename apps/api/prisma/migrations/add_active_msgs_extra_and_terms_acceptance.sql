-- AlterTable
ALTER TABLE "Workspace" ADD COLUMN     "activeMsgsExtra" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "TermsAcceptance" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "acceptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TermsAcceptance_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "TermsAcceptance" ADD CONSTRAINT "TermsAcceptance_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TermsAcceptance" ADD CONSTRAINT "TermsAcceptance_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
