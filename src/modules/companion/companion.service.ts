import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { LogInterventionDto } from './dto/log-intervention.dto.js';

/**
 * The companion's interventions, recorded.
 *
 * This module does not call a model yet. When it does, every reply must be written here in the
 * same transaction that serves it to the learner: an unlogged hint is a corrupted data point,
 * because telling latent capacity from a supported performance depends on knowing exactly how
 * much help there was (4.4).
 */
@Injectable()
export class CompanionService {
  constructor(private readonly prisma: PrismaService) {}

  async logIntervention(dto: LogInterventionDto) {
    if (dto.type === 'explanation' && !dto.resourceId) {
      throw new BadRequestException(
        'An explanation must cite a library resource. The companion never explains from nowhere.',
      );
    }

    return this.prisma.companion_event.create({
      data: {
        learner_id: dto.learnerId,
        phase: dto.phase,
        type: dto.type,
        content: dto.content,
        resource_id: dto.resourceId ?? null,
        journey_step_id: dto.journeyStepId ?? null,
        work_sample_id: dto.workSampleId ?? null,
        model_id: dto.modelId ?? null,
      },
    });
  }

  listForLearner(learnerId: string) {
    return this.prisma.companion_event.findMany({
      where: { learner_id: learnerId },
      orderBy: { created_at: 'asc' },
    });
  }

  /** How much help a learner had, by kind. Used to separate their work from the companion's. */
  async helpProfile(learnerId: string) {
    const grouped = await this.prisma.companion_event.groupBy({
      by: ['type'],
      where: { learner_id: learnerId },
      _count: { _all: true },
    });

    return grouped.map((row) => ({ type: row.type, count: row._count._all }));
  }
}
