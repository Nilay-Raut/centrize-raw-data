
/**
 * UsageService — Record and retrieve contact interaction history.
 */

import { recordCampaignUsage } from '../db/queries/contacts';
import { ValidationError } from '../types/errors';

export class UsageService {
  /**
   * Record that a set of contacts were used in a campaign.
   */
  async recordUsage(
    contactIds: string[],
    campaign: { name: string; type: string; platform?: string }
  ): Promise<void> {
    if (!campaign.name) {
      throw new ValidationError('campaign_name is required');
    }
    if (!campaign.type) {
      throw new ValidationError('campaign_type is required');
    }
    if (!contactIds || contactIds.length === 0) {
      return; // Nothing to do
    }

    await recordCampaignUsage(contactIds, {
      campaign_name: campaign.name,
      campaign_type: campaign.type,
      platform: campaign.platform,
    });
  }
}

export const usageService = new UsageService();
