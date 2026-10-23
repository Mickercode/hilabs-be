import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AddDraftDto } from './dto/add-draft.dto.js';

@Injectable()
export class PortfolioService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Adds a draft (R14). Every draft is kept: a revision is a new version row, never an edit to
   * the previous one. The database refuses an update to work_sample, so this is the only way
   * for a learner's work to change.
   *
   * The version number is allocated inside a transaction because two drafts saved at once would
   * otherwise collide on (learner, task, version).
   */
  async addDraft(dto: AddDraftDto) {
    return this.prisma.$transaction(async (tx) => {
      const latest = await tx.work_sample.findFirst({
        where: { learner_id: dto.learnerId, task_id: dto.taskId },
        orderBy: { version: 'desc' },
        select: { version: true },
      });

      return tx.work_sample.create({
        data: {
          learner_id: dto.learnerId,
          task_id: dto.taskId,
          content: dto.content,
          version: (latest?.version ?? 0) + 1,
          support_level: dto.supportLevel,
          input_mode: dto.inputMode ?? 'typed',
          time_on_task_minutes: dto.timeOnTaskMinutes ?? null,
          conditions_note: dto.conditionsNote ?? null,
        },
      });
    });
  }

  /** Every draft a learner has written, oldest first. The portfolio is the evidence (3.3). */
  listForLearner(learnerId: string) {
    return this.prisma.work_sample.findMany({
      where: { learner_id: learnerId },
      orderBy: [{ task_id: 'asc' }, { version: 'asc' }],
    });
  }

  /** The draft history for one task, which is where a trajectory becomes visible (4.2). */
  listDrafts(learnerId: string, taskId: string) {
    return this.prisma.work_sample.findMany({
      where: { learner_id: learnerId, task_id: taskId },
      orderBy: { version: 'asc' },
    });
  }
}
