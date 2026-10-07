import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, Bookmark, BriefcaseBusiness, Check, FileUp, MapPin, Search, Sparkles, UserRound, Users, X } from 'lucide-react';
import './ai.css';
import { buildRecommendedJobsSummary } from '../../src/dashboardUtils';

const API_URL = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000';
const heroImage = 'https://images.unsplash.com/photo-1556761175-b413da4baf72?auto=format&fit=crop&w=1400&q=85';
const sideImage = 'https://images.unsplash.com/photo-1521737711867-e3b97375f902?auto=format&fit=crop&w=900&q=85';

function money(value) { return value ? `₹${Number(value).toLocaleString('en-IN')}` : 'Salary undisclosed'; }
function initials(value = 'Team') { return value.split(/\s+/).map((word) => word[0]).join('').slice(0, 2).toUpperCase(); }
function experienceFor(job) { const text = `${job.title} ${job.description}`.toLowerCase(); return text.includes('senior') || text.includes('lead') ? '3+ years' : text.includes('junior') || text.includes('entry') ? '0-2 years' : '2+ years'; }
function requirementsFor(job) { return (job.description || 'Bring your skills, curiosity, and care to this role.').split(/[.;]/).map((item) => item.trim()).filter(Boolean).slice(0, 5); }
function isInternship(job) { return `${job.title} ${job.description}`.toLowerCase().includes('intern'); }

export default function App() {
  const [jobs, setJobs] = useState([]);
  const [query, setQuery] = useState('');
  const [location, setLocation] = useState('');
  const [saved, setSaved] = useState(() => JSON.parse(localStorage.getItem('northstar-saved') || '[]'));
  const [showSaved, setShowSaved] = useState(false);
  const [listingType, setListingType] = useState('all');
  const [loginOpen, setLoginOpen] = useState(false);
  const [authMode, setAuthMode] = useState('login');
  const [notice, setNotice] = useState('');
  const [login, setLogin] = useState({ email: 'testuser@example.com', password: '123456' });
  const [loginError, setLoginError] = useState('');
  const [signup, setSignup] = useState({ name: '', email: '', password: '', role: 'job_seeker' });
  const [currentUser, setCurrentUser] = useState(null);
  const [applications, setApplications] = useState([]);
  const [applyJob, setApplyJob] = useState(null);
  const [selectedJob, setSelectedJob] = useState(null);
  const [resume, setResume] = useState(null);
  const [applying, setApplying] = useState(false);
  const [recruiterJobs, setRecruiterJobs] = useState([]);
  const [recommendedJobs, setRecommendedJobs] = useState([]);
  const [recommendationsLoading, setRecommendationsLoading] = useState(false);
  const [reviewingJob, setReviewingJob] = useState(null);
  const [jobApplications, setJobApplications] = useState([]);
  const [newJob, setNewJob] = useState({ title: '', description: '', company: '', location: '', salary: '' });

  async function loadRecommendations(token) {
    if (!token) return;

    setRecommendationsLoading(true);
    try {
      const response = await fetch(`${API_URL}/recommended-jobs?min_match=50`, { headers: { Authorization: `Bearer ${token}` } });
      if (!response.ok) {
        if (response.status === 404) {
          setRecommendedJobs([]);
          return;
        }
        throw new Error('Could not load AI recommendations.');
      }

      const data = await response.json();
      setRecommendedJobs(data.recommendations || []);
    } catch (error) {
      setRecommendedJobs([]);
    } finally {
      setRecommendationsLoading(false);
    }
  }

  async function loadWorkspace(user, token) {
    setCurrentUser(user);
    const applicationResponse = await fetch(`${API_URL}/users/${user.id}/applications`, { headers: { Authorization: `Bearer ${token}` } });
    if (applicationResponse.ok) setApplications(await applicationResponse.json());
    if (user.role === 'recruiter') {
      setRecommendedJobs([]);
      const jobsResponse = await fetch(`${API_URL}/users/${user.id}/jobs`, { headers: { Authorization: `Bearer ${token}` } });
      if (jobsResponse.ok) setRecruiterJobs(await jobsResponse.json());
      return;
    }

    if (user.role === 'job_seeker') {
      await loadRecommendations(token);
      return;
    }

    setRecommendedJobs([]);
  }

  useEffect(() => {
    fetch(`${API_URL}/jobs`).then((response) => response.json()).then(setJobs).catch(() => setNotice('Could not connect to the job API. Is FastAPI running on port 8000?'));
  }, []);

  useEffect(() => {
    const token = localStorage.getItem('northstar-token');
    if (!token) return;
    fetch(`${API_URL}/me`, { headers: { Authorization: `Bearer ${token}` } }).then((response) => response.ok ? response.json() : null).then((user) => user && loadWorkspace(user, token)).catch(() => logout());
  }, []);

  useEffect(() => localStorage.setItem('northstar-saved', JSON.stringify(saved)), [saved]);

  const availableJobs = currentUser?.role === 'recruiter' ? recruiterJobs : jobs;
  const appliedJobIds = useMemo(() => new Set((applications || []).map((application) => application.job_id)), [applications]);
  const recommendationSummary = buildRecommendedJobsSummary(recommendedJobs);
  const formatApplicationStatus = (status = '') => status
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
  const filteredJobs = useMemo(() => availableJobs.filter((job) => {
    if (showSaved && !saved.includes(job.id)) return false;
    if (listingType === 'internship' && !isInternship(job)) return false;
    const text = `${job.title} ${job.company} ${job.description}`.toLowerCase();
    return (!query || text.includes(query.toLowerCase())) && (!location || job.location.toLowerCase().includes(location.toLowerCase()));
  }), [availableJobs, query, location, showSaved, saved, listingType]);

  function toggleSaved(id) { setSaved((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]); }
  function search(event) { event.preventDefault(); document.querySelector('#jobs').scrollIntoView({ behavior: 'smooth' }); }
  async function signIn(event) {
    event.preventDefault(); setLoginError('');
    try {
      const response = await fetch(`${API_URL}/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(login) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || 'Sign in failed');
      localStorage.setItem('northstar-token', data.access_token); setLoginOpen(false); setNotice('You are signed in. Your next move starts here.');
      const profile = await fetch(`${API_URL}/me`, { headers: { Authorization: `Bearer ${data.access_token}` } }).then((response) => response.json());
      await loadWorkspace(profile, data.access_token);
    } catch (error) { setLoginError(error.message); }
  }

  async function signUp(event) {
    event.preventDefault(); setLoginError('');
    try {
      const response = await fetch(`${API_URL}/users`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(signup) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || 'Could not create account');
      setLogin({ email: signup.email, password: signup.password }); setAuthMode('login'); setNotice('Account created. Sign in to continue.');
    } catch (error) { setLoginError(error.message); }
  }

  function logout() {
    localStorage.removeItem('northstar-token');
    setCurrentUser(null); setApplications([]); setRecruiterJobs([]); setReviewingJob(null); setJobApplications([]); setNotice('You are signed out.');
  }

  async function createJob(event) {
    event.preventDefault();
    const token = localStorage.getItem('northstar-token');
    const response = await fetch(`${API_URL}/jobs`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ ...newJob, salary: Number(newJob.salary) }) });
    const data = await response.json();
    if (!response.ok) { setNotice(data.detail || 'Could not create job.'); return; }
    setRecruiterJobs((items) => [data, ...items]); setJobs((items) => [data, ...items]); setNewJob({ title: '', description: '', company: '', location: '', salary: '' }); setNotice('Job published successfully.');
  }

  async function reviewApplications(job) {
    const token = localStorage.getItem('northstar-token');
    const response = await fetch(`${API_URL}/jobs/${job.id}/applications`, { headers: { Authorization: `Bearer ${token}` } });
    const data = await response.json();
    if (!response.ok) { setNotice(data.detail || 'Could not load applicants.'); return; }
    setReviewingJob(job); setJobApplications(data);
  }

  async function updateStatus(applicationId, status) {
    const token = localStorage.getItem('northstar-token');
    const response = await fetch(`${API_URL}/applications/${applicationId}/status`, { method: 'PUT', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ status }) });
    if (response.ok) setJobApplications((items) => items.map((item) => item.id === applicationId ? { ...item, status } : item));
  }

  async function submitApplication(event) {
    event.preventDefault();
    const token = localStorage.getItem('northstar-token');
    if (!token) { setApplyJob(null); setLoginOpen(true); return; }
    if (!resume) { setNotice('Choose a PDF resume before applying.'); return; }
    setApplying(true);
    try {
      const form = new FormData();
      form.append('resume', resume);
      const response = await fetch(`${API_URL}/applications?job_id=${applyJob.id}`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form });
      const data = await response.json();
      if (!response.ok) {
        if (data.detail && data.detail.toLowerCase().includes('already applied')) {
          setApplications((items) => items.some((item) => item.job_id === applyJob.id) ? items : [{ id: Date.now(), job_id: applyJob.id, status: 'applied' }, ...items]);
          setNotice('You already applied for this job.');
          setApplyJob(null);
          return;
        }
        throw new Error(data.detail || 'Application failed');
      }
      setApplications((items) => [data, ...items]); setApplyJob(null); setResume(null); setNotice(`Application sent for ${applyJob.title}.`);
    } catch (error) { setNotice(error.message); } finally { setApplying(false); }
  }

  function openApply(job) {
    setSelectedJob(null);
    if (!localStorage.getItem('northstar-token')) { setLoginOpen(true); return; }
    if (appliedJobIds.has(job.id)) {
      setNotice('You already applied for this job.');
      return;
    }
    setApplyJob(job);
  }

  return <div className="app-shell">
    <header className="topbar">
      <a className="brand" href="#top"><span className="brand-mark">N</span>northstar</a>
      <nav><a href="#jobs">Find jobs</a><a href="#how-it-works">How it works</a><a href="#companies">Companies</a></nav>
      <div className="actions"><button className="saved-button" onClick={() => { setShowSaved(!showSaved); document.querySelector('#jobs').scrollIntoView({ behavior: 'smooth' }); }}><Bookmark size={17} /> {saved.length}</button>{currentUser ? <><button className="profile-button" onClick={() => document.querySelector(currentUser.role === 'recruiter' ? '#recruiter' : '#applications').scrollIntoView({ behavior: 'smooth' })}><UserRound size={17} /> {currentUser.name}</button><button className="link-button" onClick={logout}>Log out</button></> : <><button className="link-button" onClick={() => { setAuthMode('login'); setLoginOpen(true); }}>Sign in</button><button className="dark-button" onClick={() => { setAuthMode('signup'); setLoginOpen(true); }}>Sign up <ArrowRight size={16} /></button></>}</div>
    </header>

    <main id="top">
      <section className="hero">
        <div className="hero-copy"><p className="eyebrow"><Sparkles size={14} /> A better way to move forward</p><h1>Work that feels like <em>you.</em></h1><p className="hero-lead">Meet ambitious teams, discover meaningful roles, and build a career with room to grow.</p>
          <form className="search-bar" onSubmit={search}><label><Search size={19} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Role, skill or keyword" /></label><label><MapPin size={19} /><input value={location} onChange={(event) => setLocation(event.target.value)} placeholder="City or remote" /></label><button className="coral-button">Search jobs <ArrowRight size={17} /></button></form>
          <div className="popular"><span>Popular:</span>{['Product Designer', 'Software Engineer', 'Internships', 'Marketing'].map((item) => <button key={item} onClick={() => setQuery(item)}>{item}</button>)}</div>
        </div>
        <div className="hero-visual"><img className="hero-image" src={heroImage} alt="Team collaborating around a table" /><img className="small-image" src={sideImage} alt="Colleagues talking in a bright office" /><div className="stat-card"><Sparkles size={18} /><strong>12,480+</strong><span>people found a better fit</span></div><div className="scribble">your next<br /><b>chapter</b> awaits</div></div>
      </section>

      <section className="company-strip" id="companies"><span>People are growing at</span><strong>vertex</strong><strong>arc<span>/</span>labs</strong><strong>north<span>°</span>wind</strong><strong>monument</strong><strong>kinetic</strong></section>
      <section className="market-signals" aria-label="Northstar marketplace highlights"><div><span className="signal-number">01</span><strong>Search with intent</strong><p>Roles organized around the move you want to make next.</p></div><div><span className="signal-number">02</span><strong>Meet real teams</strong><p>Explore company, location, salary, and requirements upfront.</p></div><div><span className="signal-number">03</span><strong>Move with clarity</strong><p>Apply once your next role actually feels like a fit.</p></div></section>
      <section className="jobs-section" id="jobs"><div className="section-heading"><div><p className="eyebrow">{currentUser?.role === 'recruiter' ? 'Your recruiter workspace' : 'Curated for your next move'}</p><h2>{currentUser?.role === 'recruiter' ? <>Your posted <span>roles.</span></> : <>Find your <span>right now.</span></>}</h2></div><div className="jobs-heading-actions"><div className="role-tabs"><button className={listingType === 'all' ? 'active' : ''} onClick={() => setListingType('all')}>All roles</button><button className={listingType === 'internship' ? 'active' : ''} onClick={() => setListingType('internship')}>Internships</button></div><span className="result-count">{filteredJobs.length} opportunities</span></div></div><div className="job-layout"><aside className="filters"><strong>{currentUser?.role === 'recruiter' ? 'Your roles' : 'Refine results'}</strong><button onClick={() => { setQuery(''); setLocation(''); setShowSaved(false); setListingType('all'); }}>Clear all</button><hr /><p>Quick search</p>{currentUser?.role !== 'recruiter' && <button className={showSaved ? 'filter-active' : ''} onClick={() => setShowSaved(!showSaved)}><Check size={15} /> Saved jobs</button>}<div className="filter-tip"><Sparkles size={17} /><span><b>{currentUser?.role === 'recruiter' ? 'Need a new role?' : 'Not sure where to start?'}</b><br />{currentUser?.role === 'recruiter' ? 'Publish one from your workspace.' : 'Take a 2-minute career fit quiz.'}</span></div></aside><div className="job-list">{notice && <div className="notice">{notice}</div>}{filteredJobs.map((job, index) => <article className="job-card" key={job.id} onClick={() => setSelectedJob(job)}><div className={`company-logo logo-${index % 3}`}>{initials(job.company)}</div><div className="job-info"><h3>{job.title}</h3><p>{job.company} <span>·</span> {job.location}</p><div><span className="tag">{isInternship(job) ? 'Internship' : 'Full-time'}</span><span className="tag">{job.location.toLowerCase().includes('remote') ? 'Remote' : 'Hybrid'}</span></div></div><div className="job-meta">{currentUser?.role !== 'recruiter' && <button className="apply-button" onClick={(event) => { event.stopPropagation(); openApply(job); }} disabled={appliedJobIds.has(job.id)}>{appliedJobIds.has(job.id) ? 'Applied' : 'Apply'}</button>}<button aria-label="Save job" onClick={(event) => { event.stopPropagation(); toggleSaved(job.id); }} className={saved.includes(job.id) ? 'bookmark saved' : 'bookmark'}><Bookmark size={18} fill={saved.includes(job.id) ? 'currentColor' : 'none'} /></button><strong>{money(job.salary)}</strong><small>Posted recently</small></div></article>)}{!filteredJobs.length && <div className="empty"><BriefcaseBusiness size={28} /><h3>No roles found</h3><p>{currentUser?.role === 'recruiter' ? 'Publish your first role from the recruiter workspace.' : 'Try another keyword or clear your filters.'}</p></div>}</div></div></section>
      {currentUser?.role === 'job_seeker' && (
        <section className="ai-section" id="ai-matches">
          <div className="section-heading">
            <div>
              <p className="eyebrow"><Sparkles size={14} /> AI job fit</p>
              <h2>Your <span>best matches.</span></h2>
            </div>
            <button type="button" className="link-button compact-button" onClick={() => loadRecommendations(localStorage.getItem('northstar-token'))}>Refresh</button>
          </div>

          {recommendationsLoading ? (
            <p className="muted">Finding your best-fit roles...</p>
          ) : recommendedJobs.length ? (
            <>
              <div className="ai-summary-row">
                <div className="ai-summary-card">
                  <strong>{recommendationSummary.bestScore}%</strong>
                  <span>Top match</span>
                </div>
                <div className="ai-summary-card">
                  <strong>{recommendationSummary.count}</strong>
                  <span>Roles matched</span>
                </div>
                <div className="ai-summary-card">
                  <strong>{recommendationSummary.topMatch || '—'}</strong>
                  <span>Best fit</span>
                </div>
              </div>
              <div className="ai-grid">
                {recommendedJobs.slice(0, 3).map((job) => (
                  <div className="ai-card" key={`${job.job_id}-${job.title}`}>
                    <span className="ai-badge">{job.match_percentage}% fit</span>
                    <strong>{job.title}</strong>
                    <p>{job.company}</p>
                    <small>{job.location}</small>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <p className="muted">Upload a PDF resume and apply once to unlock AI recommendations for your next role.</p>
          )}
        </section>
      )}

      {currentUser?.role === 'job_seeker' && <section className="applications-section" id="applications"><div><p className="eyebrow"><UserRound size={14} /> Your workspace</p><h2>My applications</h2></div>{applications.length ? <div className="application-list">{applications.map((application) => <div className="application-row" key={application.id}><div><strong>{application.job_title || `Role #${application.job_id}`}</strong><p>{application.company || 'Company'} · {application.location || 'Location not specified'}</p></div><span>{formatApplicationStatus(application.status)}</span></div>)}</div> : <p className="muted">You have not applied to a role yet. Upload your resume to get started.</p>}</section>}
      {currentUser?.role === 'recruiter' && <section className="recruiter-section" id="recruiter"><div className="section-heading"><div><p className="eyebrow"><BriefcaseBusiness size={14} /> Recruiter workspace</p><h2>Build your <span>team.</span></h2></div><span className="result-count">{recruiterJobs.length} jobs posted</span></div><div className="recruiter-grid"><form className="job-form" onSubmit={createJob}><h3>Publish a role</h3><input placeholder="Job title (e.g. Backend Intern)" value={newJob.title} onChange={(event) => setNewJob({ ...newJob, title: event.target.value })} required /><input placeholder="Company" value={newJob.company} onChange={(event) => setNewJob({ ...newJob, company: event.target.value })} required /><input placeholder="Location or Remote" value={newJob.location} onChange={(event) => setNewJob({ ...newJob, location: event.target.value })} required /><input type="number" min="0" placeholder="Salary" value={newJob.salary} onChange={(event) => setNewJob({ ...newJob, salary: event.target.value })} required /><textarea placeholder="Describe the role, skills, experience, and internship duration" value={newJob.description} onChange={(event) => setNewJob({ ...newJob, description: event.target.value })} required /><button className="coral-button">Publish job <ArrowRight size={16} /></button></form><div className="recruiter-jobs"><h3>Your live roles</h3>{recruiterJobs.map((job) => <div className="recruiter-job" key={job.id}><div><strong>{job.title}</strong><p>{job.company} · {job.location}</p></div><button className="review-button" onClick={() => reviewApplications(job)}><Users size={15} /> Applicants</button></div>)}</div></div>{reviewingJob && <div className="applicant-panel"><div className="panel-heading"><div><p className="eyebrow">Applications for</p><h3>{reviewingJob.title}</h3></div><button className="close-panel" onClick={() => setReviewingJob(null)}><X size={18} /></button></div>{jobApplications.length ? jobApplications.map((application) => <div className="application-row" key={application.id}><div><strong>Application #{application.id}</strong><p>Candidate #{application.user_id}</p></div><select value={application.status} onChange={(event) => updateStatus(application.id, event.target.value)}><option value="applied">Applied</option><option value="shortlisted">Shortlisted</option><option value="interview">Interview</option><option value="selected">Selected</option><option value="rejected">Rejected</option></select></div>) : <p className="muted">No applications yet.</p>}</div>}</section>}
      <section className="quote" id="how-it-works"><img src="https://images.unsplash.com/photo-1551836022-d5d88e9218df?auto=format&fit=crop&w=1100&q=85" alt="Professional working on a laptop" /><div><span className="quote-mark">“</span><blockquote>Career growth isn't a ladder. It's the freedom to build a path that feels like your own.</blockquote><p>Northstar is for the curious, the restless, and the ready.</p><button className="dark-button" onClick={() => setLoginOpen(true)}>Explore your possibilities <ArrowRight size={16} /></button></div></section>
    </main>
    <footer><a className="brand" href="#top"><span className="brand-mark">N</span>northstar</a><span>Make work meaningful.</span><span>© 2026 Northstar</span></footer>

    {loginOpen && <div className="modal-backdrop" onClick={(event) => event.target === event.currentTarget && setLoginOpen(false)}><section className="modal"><button className="close" onClick={() => setLoginOpen(false)}><X size={20} /></button><div className="modal-art"><Sparkles size={28} /><span>Your next<br /><em>chapter</em></span></div><div className="modal-content">{authMode === 'login' ? <><p className="eyebrow">Welcome back</p><h2>Let's get you moving.</h2><p>Sign in to save roles and keep your search in one place.</p><form onSubmit={signIn}><label>Email<input type="email" value={login.email} onChange={(event) => setLogin({ ...login, email: event.target.value })} required /></label><label>Password<input type="password" value={login.password} onChange={(event) => setLogin({ ...login, password: event.target.value })} required /></label><button className="coral-button full">Continue <ArrowRight size={17} /></button></form><button className="auth-switch" onClick={() => { setAuthMode('signup'); setLoginError(''); }}>New here? Create an account</button></> : <><p className="eyebrow">Start your next chapter</p><h2>Create your account.</h2><p>Join Northstar as a job seeker or recruiter.</p><form onSubmit={signUp}><label>Name<input value={signup.name} onChange={(event) => setSignup({ ...signup, name: event.target.value })} minLength="2" required /></label><label>Email<input type="email" value={signup.email} onChange={(event) => setSignup({ ...signup, email: event.target.value })} required /></label><label>Password<input type="password" value={signup.password} onChange={(event) => setSignup({ ...signup, password: event.target.value })} minLength="8" required /></label><label>Account type<select value={signup.role} onChange={(event) => setSignup({ ...signup, role: event.target.value })}><option value="job_seeker">Job seeker</option><option value="recruiter">Recruiter</option></select></label><button className="coral-button full">Create account <ArrowRight size={17} /></button></form><button className="auth-switch" onClick={() => { setAuthMode('login'); setLoginError(''); }}>Already have an account? Sign in</button></>}{loginError && <small className="login-error">{loginError}</small>}</div></section></div>}
    {applyJob && <div className="modal-backdrop" onClick={(event) => event.target === event.currentTarget && setApplyJob(null)}><section className="modal application-modal"><button className="close" onClick={() => setApplyJob(null)}><X size={20} /></button><div className="modal-art"><FileUp size={30} /><span>Make your<br /><em>next move</em></span></div><div className="modal-content"><p className="eyebrow">Apply now</p><h2>{applyJob.title}</h2><p>Send your resume to {applyJob.company}.</p><form onSubmit={submitApplication}><label className="upload-box"><FileUp size={22} />{resume ? resume.name : 'Choose a PDF resume'}<input type="file" accept="application/pdf,.pdf" onChange={(event) => setResume(event.target.files?.[0] || null)} required /></label><button className="coral-button full" disabled={applying}>{applying ? 'Sending application...' : 'Submit application'} <ArrowRight size={17} /></button></form></div></section></div>}
    {selectedJob && <div className="modal-backdrop" onClick={(event) => event.target === event.currentTarget && setSelectedJob(null)}><section className="modal job-details-modal"><button className="close" onClick={() => setSelectedJob(null)}><X size={20} /></button><div className="job-details-header"><div className="company-logo logo-1">{initials(selectedJob.company)}</div><div><p className="eyebrow">Role details</p><h2>{selectedJob.title}</h2><p>{selectedJob.company} · {selectedJob.location}</p></div></div><div className="job-specs"><div><small>Experience</small><strong>{experienceFor(selectedJob)}</strong></div><div><small>Duration</small><strong>{isInternship(selectedJob) ? 'Internship' : 'Full-time'}</strong></div><div><small>Salary</small><strong>{money(selectedJob.salary)}</strong></div><div><small>Workplace</small><strong>{selectedJob.location.toLowerCase().includes('remote') ? 'Remote' : 'Hybrid'}</strong></div></div><div className="details-content"><div><h3>Key requirements</h3><ul>{requirementsFor(selectedJob).map((requirement) => <li key={requirement}>{requirement}</li>)}</ul></div><div><h3>What you will get</h3><p>Work with {selectedJob.company} in a role designed for ownership, learning, and meaningful impact.</p></div></div>{currentUser?.role === 'recruiter' ? <p className="muted recruiter-note">Recruiters manage applications from the recruiter workspace.</p> : <button className="coral-button full" onClick={() => openApply(selectedJob)} disabled={appliedJobIds.has(selectedJob.id)}>{appliedJobIds.has(selectedJob.id) ? 'You already applied for this role' : 'Apply for this role'} <ArrowRight size={17} /></button>}</section></div>}
  </div>;
}
