import { InjectQueue } from '@nestjs/bullmq';
import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { Queue } from 'bullmq';
import { DataSource } from 'typeorm';
import { RISK_REVIEW_QUEUE } from '../applications/risk-review/risk-review.constants';
import { Public } from '../auth/auth.decorators';

type Probe = 'up' | 'down';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(
    private readonly dataSource: DataSource,
    @InjectQueue(RISK_REVIEW_QUEUE) private readonly queue: Queue,
  ) {}

  @Public()
  @Get()
  @ApiOkResponse({
    schema: { example: { status: 'ok', db: 'up', redis: 'up' } },
  })
  async check(): Promise<{ status: string; db: Probe; redis: Probe }> {
    const [db, redis] = await Promise.all([
      probe(() => this.dataSource.query('SELECT 1')),
      probe(() => this.queue.count()),
    ]);
    const down = Object.entries({ db, redis })
      .filter(([, state]) => state === 'down')
      .map(([name]) => name);
    if (down.length > 0) {
      throw new ServiceUnavailableException(`Unavailable: ${down.join(', ')}`);
    }
    return { status: 'ok', db, redis };
  }
}

// A health check must answer quickly even when a dependency hangs.
async function probe(
  check: () => Promise<unknown>,
  timeoutMs = 1000,
): Promise<Probe> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('timeout')), timeoutMs);
  });
  try {
    await Promise.race([check(), timeout]);
    return 'up';
  } catch {
    return 'down';
  } finally {
    clearTimeout(timer);
  }
}
