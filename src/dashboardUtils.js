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

export function buildRecommendedJobsSummary(recommendations = []) {
  const safeRecommendations = Array.isArray(recommendations) ? recommendations : []

  if (!safeRecommendations.length) {
    return {
      count: 0,
      topMatch: null,
      bestScore: 0,
    }
  }

  const bestMatchingJob = safeRecommendations.reduce((best, recommendation) => {
    const score = Number(recommendation?.match_percentage ?? 0)
    if (!best || score > Number(best.match_percentage ?? 0)) {
      return recommendation
    }
    return best
  }, null)

  return {
    count: safeRecommendations.length,
    topMatch: bestMatchingJob?.title ?? null,
    bestScore: Number(bestMatchingJob?.match_percentage ?? 0),
  }
}
