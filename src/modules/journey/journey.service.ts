import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { assertCanReachLearner } from '../../common/auth/scope.js';
import type { CurrentAccount } from '../../common/auth/types.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { StartStepDto } from './dto/start-step.dto.js';

@Injectable()
export class JourneyService {
  constructor(private readonly prisma: PrismaService) {}

  async startStep(learnerId: string, dto: StartStepDto) {
    if (!dto.taskId && !dto.resourceId) {
      throw new BadRequestException('A step must point at a task or a resource.');
    }

    return this.prisma.journey_step.create({
      data: {
        learner_id: learnerId,
        phase: dto.phase,
        gim_domain: dto.gimDomain ?? null,
        task_id: dto.taskId ?? null,
        resource_id: dto.resourceId ?? null,
        chosen_by_learner: dto.chosenByLearner,
      },
    });
  }

  /**
   * journey_step is a record rather than an observation, so it may be updated: a step is opened
   * when the learner arrives and closed when they leave.
   */
  async endStep(account: CurrentAccount, id: string) {
    const step = await this.prisma.journey_step.findUnique({ where: { id } });
    if (!step) {
      throw new NotFoundException('That step does not exist.');
    }
    assertCanReachLearner(account, step.learner_id);
    if (step.ended_at) {
      return step;
    }

    return this.prisma.journey_step.update({
      where: { id },
      data: { ended_at: new Date() },
    });
  }

  listForLearner(learnerId: string) {
    return this.prisma.journey_step.findMany({
      where: { learner_id: learnerId },
      orderBy: { started_at: 'asc' },
    });
  }

  /**
   * How much of the journey the learner chose for themselves, rather than being sent to.
   * Reported as counts, never as a score of the person.
   */
  async volition(learnerId: string) {
    const steps = await this.prisma.journey_step.findMany({
      where: { learner_id: learnerId },
      select: { chosen_by_learner: true, phase: true },
    });

    const chosen = steps.filter((s) => s.chosen_by_learner).length;
    return { steps: steps.length, chosenByLearner: chosen, directed: steps.length - chosen };
  }
}
