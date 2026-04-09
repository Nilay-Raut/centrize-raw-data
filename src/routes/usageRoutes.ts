
import { Router, Request, Response } from 'express';
import { usageService } from '../services/UsageService';
import { catchAsync } from '../utils/catchAsync';

const router = Router();

/**
 * POST /api/usage
 * Record usage of contacts in a campaign.
 * Body: { contact_ids: string[], campaign_name: string, campaign_type: string, platform?: string }
 */
router.post(
  '/',
  catchAsync(async (req: Request, res: Response) => {
    const { contact_ids, campaign_name, campaign_type, platform } = req.body;

    await usageService.recordUsage(contact_ids, {
      name: campaign_name,
      type: campaign_type,
      platform,
    });

    res.status(201).json({ success: true, message: 'Usage recorded successfully' });
  })
);

export default router;
