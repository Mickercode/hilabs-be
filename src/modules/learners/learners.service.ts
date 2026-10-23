import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';

@Injectable()
export class LearnersService {
  constructor(private readonly prisma: PrismaService) {}

  async findOne(id: string) {
    const learner = await this.prisma.learner.findUnique({ where: { id } });
    if (!learner) {
      throw new NotFoundException('That learner does not exist.');
    }
    return learner;
  }

  /**
   * Everything recorded about a learner, in one document (R21).
   *
   * Interpretations are deliberately excluded: during the pilot a learner sees no GIM note, so
   * that the notes cannot steer what they choose to explore. They are released in a debrief
   * conversation afterwards.
   */
  async exportAll(id: string) {
    const learner = await this.findOne(id);

    const [consent, journey, depthEvents, workSamples, reflections, testimony, companionEvents, reviewEvents] =
      await Promise.all([
        this.prisma.consent_event.findMany({ where: { learner_id: id } }),
        this.prisma.journey_step.findMany({ where: { learner_id: id } }),
        this.prisma.depth_event.findMany({ where: { learner_id: id } }),
        this.prisma.work_sample.findMany({ where: { learner_id: id } }),
        this.prisma.reflection.findMany({ where: { learner_id: id } }),
        this.prisma.testimony.findMany({ where: { learner_id: id } }),
        this.prisma.companion_event.findMany({ where: { learner_id: id } }),
        this.prisma.review_event.findMany({ where: { learner_id: id } }),
      ]);

    return {
      exportedAt: new Date().toISOString(),
      learner,
      consent,
      journey,
      depthEvents,
      workSamples,
      reflections,
      testimony,
      companionEvents,
      reviewEvents,
    };
  }

  /**
   * Opens an erasure request. Nothing is deleted here: an erasure has to be authorised, and the
   * database refuses every delete until it is.
   */
  async requestErasure(id: string, note?: string) {
    await this.findOne(id);

    return this.prisma.erasure_request.create({
      data: {
        learner_id: id,
        learner_ref_hash: `sha256:${Buffer.from(id).toString('base64url')}`,
        note: note ?? null,
      },
    });
  }

  /**
   * Carries out an authorised erasure by calling the database function that owns the delete
   * order. See PrismaService.eraseLearner.
   */
  async erase(id: string): Promise<void> {
    await this.prisma.eraseLearner(id);
  }
}
