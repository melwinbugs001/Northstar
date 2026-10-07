import { describe, expect, it } from 'vitest'
import { buildDashboardStats, buildRecommendedJobsSummary } from './dashboardUtils'

describe('buildDashboardStats', () => {
  it('counts the current users, jobs, and applications safely', () => {
    const stats = buildDashboardStats({
      users: [{ id: 1 }, { id: 2 }],
      jobs: [{ id: 10 }, { id: 11 }, { id: 12 }],
      applications: [{ id: 99 }],
    })

    expect(stats).toEqual({
      totalUsers: 2,
      totalJobs: 3,
      totalApplications: 1,
    })
  })

  it('handles empty or missing collections without crashing', () => {
    expect(buildDashboardStats({})).toEqual({
      totalUsers: 0,
      totalJobs: 0,
      totalApplications: 0,
    })
  })
})

describe('buildRecommendedJobsSummary', () => {
  it('returns the top match and the number of recommended jobs', () => {
    const summary = buildRecommendedJobsSummary([
      { title: 'Frontend Engineer', match_percentage: 78 },
      { title: 'Product Designer', match_percentage: 91 },
      { title: 'UX Researcher', match_percentage: 66 },
    ])

    expect(summary).toEqual({
      count: 3,
      topMatch: 'Product Designer',
      bestScore: 91,
    })
  })

  it('returns safe defaults for empty data', () => {
    expect(buildRecommendedJobsSummary([])).toEqual({
      count: 0,
      topMatch: null,
      bestScore: 0,
    })
  })
})
