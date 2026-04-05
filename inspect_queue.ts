import { Queue } from 'bullmq';
import redis from './src/db/redis';
import { NORMALISER_QUEUE_NAME } from './src/config/limits';

async function inspect() {
  const queue = new Queue(NORMALISER_QUEUE_NAME, { connection: redis });
  
  try {
    const [waiting, active, completed, failed, delayed] = await Promise.all([
      queue.getWaitingCount(),
      queue.getActiveCount(),
      queue.getCompletedCount(),
      queue.getFailedCount(),
      queue.getDelayedCount(),
    ]);

    console.log('Queue Metrics:', {
      waiting,
      active,
      completed,
      failed,
      delayed,
    });

    const activeJobs = await queue.getActive();
    if (activeJobs.length > 0) {
      console.log('Active Jobs Detail:', activeJobs.map(j => ({
        id: j.id,
        name: j.name,
        progress: j.progress,
        timestamp: j.timestamp
      })));
    } else {
      console.log('No active jobs found in BullMQ.');
    }

    process.exit(0);
  } catch (error) {
    console.error('Error inspecting queue:', error);
    process.exit(1);
  }
}

inspect();
