import { Router } from 'express';
import { deleteContactsBySegment, deleteContactsByBatch } from '../db/queries/contacts';
import { jobService } from '../services/JobService';
import { apiKeyAuth } from '../middleware/apiKeyAuth';
import { workerLogger } from '../middleware/logger';
import { UnauthorisedError } from '../types/errors';

const router = Router();

// Delete everything in a segment
router.delete('/delete/segment/:segment', apiKeyAuth, async (req, res, next) => {
  const { segment } = req.params;
  
  if (req.resolvedApiKey?.platform !== 'admin') {
    return next(new UnauthorisedError('Only admin keys can delete segments'));
  }

  try {
    const deletedCount = await deleteContactsBySegment(segment!);
    workerLogger.info({ message: 'Segment deleted', segment, deletedCount });
    res.json({ success: true, message: `Deleted segment ${segment} and ${deletedCount} contacts.` });
  } catch (err) {
    workerLogger.error({ message: 'Failed to delete segment', segment, err });
    res.status(500).json({ error: 'Failed to delete segment' });
  }
});

// Delete a specific job and its contacts
router.delete('/delete/job/:jobId', apiKeyAuth, async (req, res, next) => {
  const { jobId } = req.params;

  if (req.resolvedApiKey?.platform !== 'admin') {
    return next(new UnauthorisedError('Only admin keys can delete job data'));
  }

  try {
    const deletedCount = await deleteContactsByBatch(jobId!);
    await jobService.deleteJob(jobId!);
    workerLogger.info({ message: 'Job data deleted', jobId, deletedCount });
    res.json({ success: true, message: `Deleted job ${jobId} and ${deletedCount} contacts.` });
  } catch (err) {
    workerLogger.error({ message: 'Failed to delete job data', jobId, err });
    res.status(500).json({ error: 'Failed to delete job data' });
  }
});

export default router;
