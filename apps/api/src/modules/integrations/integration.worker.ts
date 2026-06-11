import { Job } from 'bullmq'
import { createWorker } from '../../lib/queue'
import { prisma } from '../../lib/prisma'
import { logger } from '../../lib/logger'
import { processNuvemshopEvent } from './platforms/nuvemshop.handler'
import { processMercadoLivreEvent } from './platforms/mercadolivre.handler'

export type IntegrationEventJobData = {
  workspaceId: string
  platform: string
  event: string
  payload: unknown
}

async function processIntegrationEvent(job: Job<IntegrationEventJobData>) {
  const { workspaceId, platform, event, payload } = job.data

  const integration = await prisma.integration.findUnique({
    where: { workspaceId_platform: { workspaceId, platform } },
  })

  if (!integration || integration.status !== 'active') return

  const automations = await prisma.automation.findMany({
    where: { workspaceId, integrationId: integration.id, isActive: true, trigger: event },
  })

  for (const automation of automations) {
    const executionId = (
      await prisma.automationExecution.create({
        data: { automationId: automation.id, status: 'running', triggerData: payload as any },
      })
    ).id

    try {
      let result: unknown

      if (platform === 'nuvemshop') {
        result = await processNuvemshopEvent({ integration, automation, event, payload })
      } else if (platform === 'mercadolivre') {
        result = await processMercadoLivreEvent({ integration, automation, event, payload })
      } else {
        result = { skipped: true, reason: 'platform not implemented yet' }
      }

      await prisma.automationExecution.update({
        where: { id: executionId },
        data: { status: 'success', result: result as any },
      })
    } catch (err: any) {
      logger.error('Automation execution error', { err, automationId: automation.id })
      await prisma.automationExecution.update({
        where: { id: executionId },
        data: { status: 'error', errorMsg: err?.message ?? 'Unknown error' },
      })
    }
  }
}

export const integrationWorker = createWorker<IntegrationEventJobData>(
  'integration-events',
  processIntegrationEvent,
  10
)
