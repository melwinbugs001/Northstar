import { describe, expect, it } from 'vitest'
import { buildDashboardStats } from './dashboardUtils'

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
