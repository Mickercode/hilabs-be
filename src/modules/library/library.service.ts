import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';

export interface LibraryFilter {
  phase?: 'osmotic' | 'tailored' | 'either';
  concept?: string;
  practitionerOnly?: boolean;
  coreOnly?: boolean;
  lowBandwidthOnly?: boolean;
}

@Injectable()
export class LibraryService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * The curated library (R8). Both study arms draw on the identical set: the arms differ in the
   * phase, never in what is available.
   */
  list(filter: LibraryFilter, take: number, skip: number) {
    return this.prisma.resource.findMany({
      where: {
        ...(filter.phase ? { phase_tag: { in: [filter.phase, 'either'] } } : {}),
        ...(filter.concept ? { concepts: { has: filter.concept } } : {}),
        ...(filter.practitionerOnly ? { is_practitioner: true } : {}),
        ...(filter.coreOnly ? { is_core: true } : {}),
        // R20: reachable without video, for a learner on a slow connection.
        ...(filter.lowBandwidthOnly
          ? { OR: [{ format: { not: 'video' } }, { has_audio_only: true }, { has_transcript: true }] }
          : {}),
      },
      orderBy: { title: 'asc' },
      take,
      skip,
    });
  }

  async findOne(id: string) {
    const resource = await this.prisma.resource.findUnique({ where: { id } });
    if (!resource) {
      throw new NotFoundException('That resource does not exist.');
    }
    return resource;
  }

  /**
   * Coverage against the library's own targets, so a gap is visible before the pilot runs
   * rather than after. Concept coverage, practitioner material, and the many-traditions floor.
   */
  async coverage() {
    const core = await this.prisma.resource.findMany({
      where: { is_core: true },
      select: { concepts: true, is_practitioner: true, origin_region: true, format: true },
    });

    const byConcept = new Map<string, number>();
    for (const resource of core) {
      for (const concept of resource.concepts) {
        byConcept.set(concept, (byConcept.get(concept) ?? 0) + 1);
      }
    }

    return {
      coreResources: core.length,
      practitionerResources: core.filter((r) => r.is_practitioner).length,
      byConcept: Object.fromEntries([...byConcept.entries()].sort()),
      conceptsBelowTarget: ['C1', 'C2', 'C3', 'C4', 'C5', 'C6', 'C7', 'C8'].filter(
        (c) => (byConcept.get(c) ?? 0) < 2,
      ),
    };
  }
}
