export function buildDashboardStats({ users = [], jobs = [], applications = [] } = {}) {
  const safeUsers = Array.isArray(users) ? users : []
  const safeJobs = Array.isArray(jobs) ? jobs : []
  const safeApplications = Array.isArray(applications) ? applications : []

  return {
    totalUsers: safeUsers.length,
    totalJobs: safeJobs.length,
    totalApplications: safeApplications.length,
  }
}
