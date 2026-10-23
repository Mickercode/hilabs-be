import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';

/**
 * The researcher side: rating progress, blind-export integrity and GIM interpretations.
 *
 * Nothing here is ever reachable from a learner-facing client. During the pilot a learner sees
 * no GIM note, no signal score and no convergence classification (R16).
 */
@Injectable()
export class ResearchService {
  constructor(private readonly prisma: PrismaService) {}

  /** How far the rating panel has got, and where adjudication is still owed. */
  async ratingProgress() {
    const [samples, ratings, adjudications] = await Promise.all([
      this.prisma.work_sample.count(),
      this.prisma.rating.count({ where: { pass: 'independent' } }),
      this.prisma.rating.count({ where: { pass: 'adjudication' } }),
    ]);

    return {
      workSamples: samples,
      independentRatings: ratings,
      adjudications,
      // Two independent raters score every sample.
      outstanding: Math.max(0, samples * 2 - ratings),
    };
  }

  /**
   * Redaction marker frequency by arm, per batch (R18).
   *
   * If the full arm carries markers and the skip arm does not, the redaction rules are leaking
   * the arm and the panel is no longer blind. The view does the work; this exposes it.
   */
  markerParity() {
    return this.prisma.$queryRaw`
      SELECT batch_id, study_arm, items, markers, markers_per_item
      FROM v_export_marker_parity
      ORDER BY batch_id, study_arm
    `;
  }

  /** The current interpretation for each learner and type: the row nothing supersedes. */
  currentHypotheses() {
    return this.prisma.$queryRaw`
      SELECT id, learner_id, gim_type, domain, convergence, support_profile, created_at
      FROM v_gim_hypothesis_current
      ORDER BY created_at DESC
    `;
  }

  /**
   * Must always be empty. A hypothesis with no evidence breaks observation before inference,
   * and is a bug rather than a data state.
   */
  hypothesesMissingEvidence() {
    return this.prisma.$queryRaw`SELECT * FROM v_gim_hypothesis_missing_evidence`;
  }

  /** Learner disputes of an interpretation, and whether anyone has answered them (R15). */
  disputes() {
    return this.prisma.dispute.findMany({
      orderBy: { created_at: 'desc' },
      include: { dispute_response: true },
    });
  }
}
