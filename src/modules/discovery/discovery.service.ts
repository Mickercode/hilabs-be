import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { RecordDepthEventDto } from './dto/record-depth-event.dto.js';

@Injectable()
export class DiscoveryService {
  constructor(private readonly prisma: PrismaService) {}

  /** The six Discovery challenges, one per GIM domain (R4). */
  listChallenges() {
    return this.prisma.task.findMany({
      where: { kind: 'discovery' },
      orderBy: [{ code: 'asc' }, { tier: 'asc' }],
    });
  }

  async recordDepthEvent(dto: RecordDepthEventDto) {
    if (dto.type === 'time_on_task' && dto.valueSeconds === undefined) {
      throw new BadRequestException('time_on_task needs valueSeconds.');
    }

    return this.prisma.depth_event.create({
      data: {
        learner_id: dto.learnerId,
        task_id: dto.taskId ?? null,
        journey_step_id: dto.journeyStepId ?? null,
        type: dto.type,
        value_seconds: dto.valueSeconds ?? null,
        idle_excluded_seconds: dto.idleExcludedSeconds ?? null,
        detail: dto.detail ?? null,
      },
    });
  }

  /**
   * Counts of depth-seeking behaviour, for the researcher view only. Never surfaced to a
   * learner during the pilot: seeing it would change what they choose to explore.
   */
  async summary(learnerId: string) {
    const grouped = await this.prisma.depth_event.groupBy({
      by: ['type'],
      where: { learner_id: learnerId },
      _count: { _all: true },
      _sum: { value_seconds: true },
    });

    return grouped.map((row) => ({
      type: row.type,
      count: row._count._all,
      totalSeconds: row._sum.value_seconds ?? 0,
    }));
  }
}
