import { Job, Queue } from 'bullmq';
import { RiskReviewJobData, riskReviewJobId } from './risk-review.constants';
import { RiskReviewQueue } from './risk-review.queue';

type JobState = Awaited<ReturnType<Job['getState']>>;

function fakeJob(states: JobState[], retryError?: Error) {
  const getState = jest.fn<Promise<JobState>, []>();
  for (const state of states) getState.mockResolvedValueOnce(state);
  const retry = jest.fn<Promise<void>, [string, object]>();
  if (retryError) retry.mockRejectedValue(retryError);
  else retry.mockResolvedValue(undefined);
  return { getState, retry };
}

function setup(job: ReturnType<typeof fakeJob> | undefined) {
  const queue = {
    add: jest.fn().mockResolvedValue(undefined),
    getJob: jest.fn().mockResolvedValue(job),
  };
  return {
    queue,
    riskQueue: new RiskReviewQueue(
      queue as unknown as Queue<RiskReviewJobData>,
    ),
  };
}

describe('RiskReviewQueue.retry', () => {
  it('adds the job when it was never queued', async () => {
    const { queue, riskQueue } = setup(undefined);

    await riskQueue.retry('app-1', 1);

    expect(queue.add).toHaveBeenCalledWith(
      'assess',
      { applicationId: 'app-1', submissionVersion: 1 },
      { jobId: riskReviewJobId('app-1', 1) },
    );
  });

  it('retries a failed job with a fresh attempt budget', async () => {
    const job = fakeJob(['failed']);
    const { riskQueue } = setup(job);

    await riskQueue.retry('app-1', 1);

    expect(job.retry).toHaveBeenCalledWith('failed', {
      resetAttemptsMade: true,
    });
  });

  it.each<JobState>(['waiting', 'active', 'delayed', 'completed'])(
    'does nothing when the job is %s',
    async (state) => {
      const job = fakeJob([state]);
      const { queue, riskQueue } = setup(job);

      await riskQueue.retry('app-1', 1);

      expect(job.retry).not.toHaveBeenCalled();
      expect(queue.add).not.toHaveBeenCalled();
    },
  );

  it('succeeds when a concurrent retry moved the job out of failed first', async () => {
    const job = fakeJob(['failed', 'waiting'], new Error('Job is not failed'));
    const { riskQueue } = setup(job);

    await expect(riskQueue.retry('app-1', 1)).resolves.toBeUndefined();
  });

  it('rethrows when the job is still failed after the error', async () => {
    const job = fakeJob(['failed', 'failed'], new Error('Redis error'));
    const { riskQueue } = setup(job);

    await expect(riskQueue.retry('app-1', 1)).rejects.toThrow('Redis error');
  });
});
