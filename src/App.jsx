import { useEffect, useMemo, useState } from "react"
import "./App.css"
import { buildDashboardStats } from "./dashboardUtils"
import { isAdminRoleAllowed } from "./adminAccess"
import { API_BASE_URL } from "./config"

const PAGE_SIZE = 6

function getToken() {
  return localStorage.getItem("admin_token")
}

function readArrayPayload(payload) {
  if (Array.isArray(payload)) {
    return payload
  }

  if (!payload || typeof payload !== "object") {
    return []
  }

  const candidateKeys = [
    "items",
    "data",
    "results",
    "records",
    "users",
    "jobs",
    "applications",
    "user_list",
    "job_list",
    "application_list",
  ]

  for (const key of candidateKeys) {
    if (Array.isArray(payload[key])) {
      return payload[key]
    }
  }

  if (Array.isArray(payload.data)) {
    return payload.data
  }

  for (const key of candidateKeys) {
    const nestedValue = payload[key]

    if (nestedValue && typeof nestedValue === "object") {
      const nestedList = readArrayPayload(nestedValue)
      if (nestedList.length) {
        return nestedList
      }
    }
  }

  return []
}

function getErrorMessage(error) {
  if (error && error.message) {
    return error.message
  }

  return "Something went wrong. Please try again."
}

function formatDisplayValue(value, fallback = "N/A") {
  if (value === null || value === undefined || value === "") {
    return fallback
  }

  return String(value)
}

function App() {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [loggedIn, setLoggedIn] = useState(!!getToken())
  const [users, setUsers] = useState([])
  const [jobs, setJobs] = useState([])
  const [applications, setApplications] = useState([])
  const [message, setMessage] = useState("")
  const [activePage, setActivePage] = useState("dashboard")
  const [currentPage, setCurrentPage] = useState(1)
  const [loading, setLoading] = useState({
    users: false,
    jobs: false,
    applications: false,
  })

  const dashboardStats = useMemo(
    () => buildDashboardStats({ users, jobs, applications }),
    [users, jobs, applications]
  )

  useEffect(() => {
    setCurrentPage(1)
  }, [activePage])

  const paginatedUsers = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE
    return users.slice(start, start + PAGE_SIZE)
  }, [users, currentPage])

  const paginatedJobs = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE
    return jobs.slice(start, start + PAGE_SIZE)
  }, [jobs, currentPage])

  const paginatedApplications = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE
    return applications.slice(start, start + PAGE_SIZE)
  }, [applications, currentPage])

  const totalPages = useMemo(() => {
    const total = activePage === "users" ? users.length : activePage === "jobs" ? jobs.length : applications.length
    return Math.max(1, Math.ceil(total / PAGE_SIZE))
  }, [activePage, users.length, jobs.length, applications.length])

  const handleLogout = () => {
    localStorage.removeItem("admin_token")
    setLoggedIn(false)
    setUsers([])
    setJobs([])
    setApplications([])
    setMessage("")
    setActivePage("dashboard")
  }

  const fetchWithAuth = async (path, options = {}) => {
    const token = getToken()

    if (!token) {
      throw new Error("Session expired. Please log in again.")
    }

    const response = await fetch(`${API_BASE_URL}${path}`, {
      ...options,
      headers: {
        ...(options.headers || {}),
        Authorization: `Bearer ${token}`,
      },
    })

    if (response.status === 401) {
      localStorage.removeItem("admin_token")
      setLoggedIn(false)
      setActivePage("dashboard")
      throw new Error("Your session expired. Please log in again.")
    }

    let payload = []

    try {
      payload = await response.json()
    } catch {
      payload = []
    }

    if (!response.ok) {
      const detail = payload?.detail || payload?.message || "Request failed"
      throw new Error(detail)
    }

    if (options.method && options.method.toUpperCase() === "DELETE") {
      return payload
    }

    return readArrayPayload(payload)
  }

  const fetchAdminData = async () => {
    if (!loggedIn) {
      return
    }

    try {
      const meResponse = await fetch(`${API_BASE_URL}/me`, {
        headers: {
          Authorization: `Bearer ${getToken()}`,
        },
      })

      if (!meResponse.ok) {
        throw new Error("Session expired. Please log in again.")
      }

      const profile = await meResponse.json()

      if (!isAdminRoleAllowed(profile?.role)) {
        localStorage.removeItem("admin_token")
        setLoggedIn(false)
        setUsers([])
        setJobs([])
        setApplications([])
        setMessage("Recruiters are not allowed to access the admin panel.")
        return
      }
    } catch (error) {
      localStorage.removeItem("admin_token")
      setLoggedIn(false)
      setMessage(getErrorMessage(error))
      return
    }

    setMessage("")

    try {
      setLoading({ users: true, jobs: true, applications: true })

      const [usersData, jobsData, applicationsData] = await Promise.all([
        fetchWithAuth("/admin/users"),
        fetchWithAuth("/jobs"),
        fetchWithAuth("/admin/applications"),
      ])

      setUsers(usersData)
      setJobs(jobsData)
      setApplications(applicationsData)
    } catch (error) {
      setMessage(getErrorMessage(error))
    } finally {
      setLoading({ users: false, jobs: false, applications: false })
    }
  }

  useEffect(() => {
    if (loggedIn) {
      fetchAdminData()
    }
  }, [loggedIn])

  const handleLogin = async (event) => {
    event.preventDefault()

    try {
      const response = await fetch(`${API_BASE_URL}/login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email,
          password,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.detail || "Login failed")
      }

      const token = data.access_token || data.token

      if (!token) {
        throw new Error("Authentication response did not include a token.")
      }

      const profileResponse = await fetch(`${API_BASE_URL}/me`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      })

      if (!profileResponse.ok) {
        throw new Error("Unable to verify admin access.")
      }

      const profile = await profileResponse.json()

      if (!isAdminRoleAllowed(profile?.role)) {
        throw new Error("Recruiters are not allowed to access the admin panel.")
      }

      localStorage.setItem("admin_token", token)
      setLoggedIn(true)
      setMessage("")
      setPassword("")
    } catch (error) {
      localStorage.removeItem("admin_token")
      setLoggedIn(false)
      setMessage(getErrorMessage(error))
    }
  }

  const handleDeleteUser = async (userId) => {
    const user = users.find((item) => item.id === userId)
    const userLabel = user ? user.name || user.email || `User #${userId}` : `User #${userId}`

    const confirmed = window.confirm(`Delete ${userLabel}? This action cannot be undone.`)

    if (!confirmed) {
      return
    }

    try {
      await fetchWithAuth(`/admin/users/${userId}`, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
        },
      })

      setUsers((currentUsers) => currentUsers.filter((item) => item.id !== userId))
      setMessage("User deleted successfully.")
    } catch (error) {
      setMessage(getErrorMessage(error))
    }
  }

  const renderUserCard = (user) => (
    <div className="data-card user-card" key={user.id ?? `${user.email ?? "user"}-${Math.random()}`}>
      <div className="card-badge">User</div>
      <p><strong>ID:</strong> {formatDisplayValue(user.id)}</p>
      <p><strong>Name:</strong> {formatDisplayValue(user.name ?? user.full_name ?? user.first_name)}</p>
      <p><strong>Email:</strong> {formatDisplayValue(user.email)}</p>
      <p><strong>Role:</strong> <span className="pill">{formatDisplayValue(user.role ?? user.user_role)}</span></p>

      <button
        type="button"
        className="delete-button"
        onClick={() => handleDeleteUser(user.id)}
      >
        Delete User
      </button>
    </div>
  )

  const renderJobCard = (job) => (
    <div className="data-card job-card" key={job.id ?? `${job.title ?? "job"}-${Math.random()}`}>
      <div className="card-badge accent">Job</div>
      <p><strong>ID:</strong> {formatDisplayValue(job.id)}</p>
      <p><strong>Title:</strong> {formatDisplayValue(job.title ?? job.name ?? job.role)}</p>
      <p><strong>Company:</strong> {formatDisplayValue(job.company ?? job.company_name)}</p>
      <p><strong>Location:</strong> {formatDisplayValue(job.location ?? job.city)}</p>
      <p><strong>Type:</strong> <span className="pill pill-soft">{formatDisplayValue(job.job_type ?? job.type)}</span></p>
    </div>
  )

  const renderApplicationCard = (application) => (
    <div className="data-card application-card" key={application.id ?? `${application.email ?? "application"}-${Math.random()}`}>
      <div className="card-badge purple">Application</div>
      <p><strong>ID:</strong> {formatDisplayValue(application.id)}</p>
      <p><strong>Candidate:</strong> {formatDisplayValue(application.name ?? application.full_name ?? application.candidate_name)}</p>
      <p><strong>Email:</strong> {formatDisplayValue(application.email ?? application.candidate_email)}</p>
      <p><strong>Job:</strong> {formatDisplayValue(application.job_title ?? application.job?.title ?? application.position)}</p>
      <p><strong>Status:</strong> <span className="status-badge">{formatDisplayValue(application.status ?? "Pending")}</span></p>
    </div>
  )

  const renderPagination = (count) => {
    if (count <= PAGE_SIZE) {
      return null
    }

    return (
      <div className="pagination-wrap">
        <button
          type="button"
          className="pagination-button"
          disabled={currentPage === 1}
          onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
        >
          Previous
        </button>

        <div className="pagination-numbers">
          {Array.from({ length: totalPages }, (_, index) => index + 1).map((pageNumber) => (
            <button
              key={pageNumber}
              type="button"
              className={pageNumber === currentPage ? "page-number active" : "page-number"}
              onClick={() => setCurrentPage(pageNumber)}
            >
              {pageNumber}
            </button>
          ))}
        </div>

        <button
          type="button"
          className="pagination-button"
          disabled={currentPage === totalPages}
          onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
        >
          Next
        </button>
      </div>
    )
  }

  if (!loggedIn) {
    return (
      <div className="auth-page">
        <div className="auth-card">
          <h1>NorthStar Admin</h1>
          <h2>Admin Login</h2>

          <form onSubmit={handleLogin} className="auth-form">
            <div className="field-group">
              <label htmlFor="email">Email</label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="Enter admin email"
              />
            </div>

            <div className="field-group">
              <label htmlFor="password">Password</label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Enter password"
              />
            </div>

            <button type="submit" className="primary-button">Login</button>
          </form>

          {message && <p className="error-message">{message}</p>}
        </div>
      </div>
    )
  }

  return (
    <div className="admin-layout">
      <aside className="sidebar">
        <h2>NorthStar</h2>

        <nav>
          <button
            type="button"
            className={activePage === "dashboard" ? "nav-button active" : "nav-button"}
            onClick={() => setActivePage("dashboard")}
          >
            Dashboard
          </button>

          <button
            type="button"
            className={activePage === "users" ? "nav-button active" : "nav-button"}
            onClick={() => setActivePage("users")}
          >
            Users
          </button>

          <button
            type="button"
            className={activePage === "jobs" ? "nav-button active" : "nav-button"}
            onClick={() => setActivePage("jobs")}
          >
            Jobs
          </button>

          <button
            type="button"
            className={activePage === "applications" ? "nav-button active" : "nav-button"}
            onClick={() => setActivePage("applications")}
          >
            Applications
          </button>
        </nav>

        <button type="button" className="logout-button" onClick={handleLogout}>
          Logout
        </button>
      </aside>

      <main className="dashboard">
        <header className="page-header">
          <div>
            <p className="eyebrow">Admin Portal</p>
            <h1>Dashboard</h1>
          </div>
        </header>

        {message && <p className="error-message">{message}</p>}

        {activePage === "dashboard" && (
          <>
            <div className="cards">
              <div className="card">
                <h3>Total Users</h3>
                <p>{dashboardStats.totalUsers}</p>
              </div>

              <div className="card">
                <h3>Total Jobs</h3>
                <p>{dashboardStats.totalJobs}</p>
              </div>

              <div className="card">
                <h3>Total Applications</h3>
                <p>{dashboardStats.totalApplications}</p>
              </div>
            </div>

            <section className="panel">
              <h2>Quick Overview</h2>
              <div className="overview-grid">
                <div>
                  <span className="overview-label">Users</span>
                  <strong>{dashboardStats.totalUsers}</strong>
                </div>
                <div>
                  <span className="overview-label">Jobs</span>
                  <strong>{dashboardStats.totalJobs}</strong>
                </div>
                <div>
                  <span className="overview-label">Applications</span>
                  <strong>{dashboardStats.totalApplications}</strong>
                </div>
              </div>
            </section>
          </>
        )}

        {activePage === "users" && (
          <section className="panel">
            <div className="panel-header">
              <h2>Users</h2>
              <span className="panel-badge">{users.length} total</span>
            </div>
            {loading.users ? (
              <p>Loading users...</p>
            ) : users.length ? (
              <>
                <div className="data-grid">{paginatedUsers.map(renderUserCard)}</div>
                {renderPagination(users.length)}
              </>
            ) : (
              <p className="empty-state">No users found.</p>
            )}
          </section>
        )}

        {activePage === "jobs" && (
          <section className="panel">
            <div className="panel-header">
              <h2>Jobs</h2>
              <span className="panel-badge">{jobs.length} total</span>
            </div>
            {loading.jobs ? (
              <p>Loading jobs...</p>
            ) : jobs.length ? (
              <>
                <div className="data-grid">{paginatedJobs.map(renderJobCard)}</div>
                {renderPagination(jobs.length)}
              </>
            ) : (
              <p className="empty-state">No jobs found.</p>
            )}
          </section>
        )}

        {activePage === "applications" && (
          <section className="panel">
            <div className="panel-header">
              <h2>Applications</h2>
              <span className="panel-badge">{applications.length} total</span>
            </div>
            {loading.applications ? (
              <p>Loading applications...</p>
            ) : applications.length ? (
              <>
                <div className="data-grid">{paginatedApplications.map(renderApplicationCard)}</div>
                {renderPagination(applications.length)}
              </>
            ) : (
              <p className="empty-state">No applications found.</p>
            )}
          </section>
        )}
      </main>
    </div>
  )
}

export default App