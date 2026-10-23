import { BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { CompanionService } from './companion.service.js';
import { LogInterventionDto } from './dto/log-intervention.dto.js';

describe('CompanionService', () => {
  const create = vi.fn();
  const prisma = { companion_event: { create } } as unknown as PrismaService;
  const service = new CompanionService(prisma);

  const LEARNER = '11111111-1111-1111-1111-111111111111';

  const base: LogInterventionDto = {
    phase: 'tailored',
    type: 'explanation',
    content: 'A delay separates the cause from the symptom.',
  };

  beforeEach(() => {
    create.mockReset();
    create.mockResolvedValue({ id: 'ok' });
  });

  it('refuses an explanation with no cited resource', async () => {
    await expect(service.logIntervention(LEARNER, base)).rejects.toBeInstanceOf(BadRequestException);
    expect(create).not.toHaveBeenCalled();
  });

  it('accepts an explanation that cites one', async () => {
    await service.logIntervention(LEARNER, {
      ...base,
      resourceId: '44444444-4444-4444-4444-444444444444',
    });

    expect(create).toHaveBeenCalledOnce();
    expect(create.mock.calls[0][0].data.resource_id).toBe(
      '44444444-4444-4444-4444-444444444444',
    );
  });

  it('allows a hint without one, because a hint explains nothing', async () => {
    await service.logIntervention(LEARNER, { ...base, type: 'hint' });
    expect(create).toHaveBeenCalledOnce();
  });
});
