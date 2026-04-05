/**
 * Insights aggregation queries — powers the admin dashboard.
 *
 * All queries use Knex parameterised builders (no raw string concatenation).
 * These are admin-only — never expose to the platform API key layer.
 */

import db from '../knex';

export interface DistributionRow {
  label: string;
  count: number;
}

export interface InsightsData {
  totalContacts: number;

  // Channel health
  optOutWhatsapp: number;
  optOutEmail: number;
  optOutCall: number;

  // Distribution breakdowns
  segmentDistribution: DistributionRow[];
  languageDistribution: DistributionRow[];
  genderDistribution: DistributionRow[];

  // Geographic
  topStates: DistributionRow[];
  topCities: DistributionRow[];

  // Professional
  topIndustries: DistributionRow[];
  topSectors: DistributionRow[];
  topCompanies: DistributionRow[];

  // Data completeness (% filled, 0-100)
  completeness: Record<string, number>;

  // Tagged vs untagged
  taggedCount: number;
  untaggedCount: number;

  // Upload jobs health
  jobStats: {
    total: number;
    done: number;
    processing: number;
    queued: number;
    failed: number;
    totalRows: number;
    processedRows: number;
    failedRows: number;
  };

  // Recent upload history (last 30 days, grouped by date)
  uploadActivity: { date: string; jobs: number; rows: number }[];
}

// ─── helpers ──────────────────────────────────────────────────────────────────

function toDistribution(rows: { label: string | null; count: string }[]): DistributionRow[] {
  return rows
    .filter((r) => r.label !== null && r.label !== '')
    .map((r) => ({ label: r.label as string, count: parseInt(r.count, 10) }))
    .sort((a, b) => b.count - a.count);
}

// ─── main query ───────────────────────────────────────────────────────────────

export async function getInsights(): Promise<InsightsData> {
  const [
    totalResult,
    optOutResult,
    segments,
    languages,
    genders,
    states,
    cities,
    industries,
    sectors,
    companies,
    completenessResult,
    taggedResult,
    jobStatsResult,
    uploadActivityResult,
  ] = await Promise.all([
    // 1. Total contacts
    db('contacts').count('id as count').first() as unknown as Promise<{ count: string }>,

    // 2. Opt-out counts (single query for all three)
    db('contacts')
      .select(
        db.raw('SUM(CASE WHEN opt_out_whatsapp THEN 1 ELSE 0 END) AS whatsapp'),
        db.raw('SUM(CASE WHEN opt_out_email    THEN 1 ELSE 0 END) AS email'),
        db.raw('SUM(CASE WHEN opt_out_call     THEN 1 ELSE 0 END) AS call'),
      )
      .first() as unknown as Promise<{ whatsapp: string; email: string; call: string }>,

    // 3. Segment distribution
    db('contacts')
      .select(db.raw('segment as label'), db.raw('COUNT(*) as count'))
      .groupBy('segment') as unknown as Promise<{ label: string; count: string }[]>,

    // 4. Language distribution
    db('contacts')
      .select(db.raw('language as label'), db.raw('COUNT(*) as count'))
      .groupBy('language') as unknown as Promise<{ label: string; count: string }[]>,

    // 5. Gender distribution
    db('contacts')
      .select(db.raw('gender as label'), db.raw('COUNT(*) as count'))
      .whereNotNull('gender')
      .groupBy('gender') as unknown as Promise<{ label: string; count: string }[]>,

    // 6. Top 10 states
    db('contacts')
      .select(db.raw('state as label'), db.raw('COUNT(*) as count'))
      .whereNotNull('state')
      .groupBy('state')
      .orderBy('count', 'desc')
      .limit(10) as unknown as Promise<{ label: string; count: string }[]>,

    // 7. Top 10 cities
    db('contacts')
      .select(db.raw('city as label'), db.raw('COUNT(*) as count'))
      .whereNotNull('city')
      .groupBy('city')
      .orderBy('count', 'desc')
      .limit(10) as unknown as Promise<{ label: string; count: string }[]>,

    // 8. Top 10 industries
    db('contacts')
      .select(db.raw('industry as label'), db.raw('COUNT(*) as count'))
      .whereNotNull('industry')
      .groupBy('industry')
      .orderBy('count', 'desc')
      .limit(10) as unknown as Promise<{ label: string; count: string }[]>,

    // 9. Top 10 sectors
    db('contacts')
      .select(db.raw('sector as label'), db.raw('COUNT(*) as count'))
      .whereNotNull('sector')
      .groupBy('sector')
      .orderBy('count', 'desc')
      .limit(10) as unknown as Promise<{ label: string; count: string }[]>,

    // 10. Top 10 companies
    db('contacts')
      .select(db.raw('company_name as label'), db.raw('COUNT(*) as count'))
      .whereNotNull('company_name')
      .groupBy('company_name')
      .orderBy('count', 'desc')
      .limit(10) as unknown as Promise<{ label: string; count: string }[]>,

    // 11. Data completeness — % of non-null per field
    db('contacts').select(
      db.raw('COUNT(*) AS total'),
      db.raw('COUNT(email)        AS has_email'),
      db.raw('COUNT(name)         AS has_name'),
      db.raw('COUNT(gender)       AS has_gender'),
      db.raw('COUNT(dob)          AS has_dob'),
      db.raw('COUNT(company_name) AS has_company'),
      db.raw('COUNT(designation)  AS has_designation'),
      db.raw('COUNT(industry)     AS has_industry'),
      db.raw('COUNT(sector)       AS has_sector'),
      db.raw('COUNT(city)         AS has_city'),
      db.raw('COUNT(state)        AS has_state'),
      db.raw('COUNT(pincode)      AS has_pincode'),
      db.raw('COUNT(website)      AS has_website'),
      db.raw('COUNT(linkedin_url) AS has_linkedin'),
    ).first() as unknown as Promise<Record<string, string>>,

    // 12. Tagged vs untagged
    db('contacts').select(
      db.raw('COUNT(CASE WHEN tags IS NOT NULL AND array_length(tags, 1) > 0 THEN 1 END) AS tagged'),
      db.raw('COUNT(CASE WHEN tags IS NULL OR  array_length(tags, 1) IS NULL THEN 1 END) AS untagged'),
    ).first() as unknown as Promise<{ tagged: string; untagged: string }>,

    // 13. Job stats (all time)
    db('upload_jobs').select(
      db.raw('COUNT(*) AS total'),
      db.raw("COUNT(CASE WHEN status = 'done'       THEN 1 END) AS done"),
      db.raw("COUNT(CASE WHEN status = 'processing' THEN 1 END) AS processing"),
      db.raw("COUNT(CASE WHEN status = 'queued'     THEN 1 END) AS queued"),
      db.raw("COUNT(CASE WHEN status = 'failed'     THEN 1 END) AS failed"),
      db.raw('SUM(total_rows)     AS total_rows'),
      db.raw('SUM(processed_rows) AS processed_rows'),
      db.raw('SUM(failed_rows)    AS failed_rows'),
    ).first() as unknown as Promise<Record<string, string>>,

    // 14. Upload activity — last 30 days
    db('upload_jobs')
      .select(
        db.raw("DATE(created_at) AS date"),
        db.raw('COUNT(*) AS jobs'),
        db.raw('SUM(total_rows) AS rows'),
      )
      .where('created_at', '>=', db.raw("NOW() - INTERVAL '30 days'"))
      .groupByRaw('DATE(created_at)')
      .orderByRaw('DATE(created_at) ASC') as unknown as Promise<{ date: string; jobs: string; rows: string }[]>,
  ]);

  const total = parseInt(totalResult.count, 10) || 1; // prevent divide-by-zero

  const pct = (v: string) => Math.round((parseInt(v, 10) / total) * 100);

  const completeness: Record<string, number> = {
    email:       pct(completenessResult['has_email']       ?? '0'),
    name:        pct(completenessResult['has_name']        ?? '0'),
    gender:      pct(completenessResult['has_gender']      ?? '0'),
    dob:         pct(completenessResult['has_dob']         ?? '0'),
    company:     pct(completenessResult['has_company']     ?? '0'),
    designation: pct(completenessResult['has_designation'] ?? '0'),
    industry:    pct(completenessResult['has_industry']    ?? '0'),
    sector:      pct(completenessResult['has_sector']      ?? '0'),
    city:        pct(completenessResult['has_city']        ?? '0'),
    state:       pct(completenessResult['has_state']       ?? '0'),
    pincode:     pct(completenessResult['has_pincode']     ?? '0'),
    website:     pct(completenessResult['has_website']     ?? '0'),
    linkedin:    pct(completenessResult['has_linkedin']    ?? '0'),
  };

  return {
    totalContacts:         parseInt(totalResult.count, 10),
    optOutWhatsapp:        parseInt(optOutResult.whatsapp ?? '0', 10),
    optOutEmail:           parseInt(optOutResult.email    ?? '0', 10),
    optOutCall:            parseInt(optOutResult.call     ?? '0', 10),
    segmentDistribution:   toDistribution(segments),
    languageDistribution:  toDistribution(languages),
    genderDistribution:    toDistribution(genders),
    topStates:             toDistribution(states),
    topCities:             toDistribution(cities),
    topIndustries:         toDistribution(industries),
    topSectors:            toDistribution(sectors),
    topCompanies:          toDistribution(companies),
    completeness,
    taggedCount:   parseInt(taggedResult.tagged   ?? '0', 10),
    untaggedCount: parseInt(taggedResult.untagged ?? '0', 10),
    jobStats: {
      total:         parseInt(jobStatsResult['total']          ?? '0', 10),
      done:          parseInt(jobStatsResult['done']           ?? '0', 10),
      processing:    parseInt(jobStatsResult['processing']     ?? '0', 10),
      queued:        parseInt(jobStatsResult['queued']         ?? '0', 10),
      failed:        parseInt(jobStatsResult['failed']         ?? '0', 10),
      totalRows:     parseInt(jobStatsResult['total_rows']     ?? '0', 10),
      processedRows: parseInt(jobStatsResult['processed_rows'] ?? '0', 10),
      failedRows:    parseInt(jobStatsResult['failed_rows']    ?? '0', 10),
    },
    uploadActivity: uploadActivityResult.map((r) => ({
      date: r.date,
      jobs: parseInt(r.jobs, 10),
      rows: parseInt(r.rows, 10),
    })),
  };
}
