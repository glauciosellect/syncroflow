-- AlterTable
ALTER TABLE "Workspace" ADD COLUMN     "activeMsgsResetAt" TIMESTAMP(3),
ADD COLUMN     "activeMsgsUsed" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "Appointment" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "googleEventId" TEXT NOT NULL,
    "startAt" TIMESTAMP(3) NOT NULL,
    "summary" TEXT NOT NULL,
    "reminderJobId" TEXT,
    "reminderSentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Appointment_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;
