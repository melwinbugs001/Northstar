# Northstar Job Portal

Northstar is a job marketplace with separate applications for the FastAPI backend and React frontend.

## Project structure

```text
.
|-- main.py                 FastAPI routes and application logic
|-- auth.py                 Password hashing and JWT authentication
|-- database.py             SQLAlchemy database setup
|-- models.py               Database models
|-- schemas.py              Request validation schemas
|-- requirements.txt        Python dependencies
|-- .env.example            Environment variable template
|-- frontend/               React + Vite application
|   |-- src/App.jsx
|   |-- src/main.jsx
|   |-- package.json
|   `-- ...
`-- resumes/                Local uploaded resumes, ignored by Git
```

## Requirements

Install these before running the project:

- Python 3.11 or newer
- Node.js 18 or newer, including npm
- Git
- A Gemini API key for AI resume features

## Recommended VS Code extensions

Install these extensions in VS Code:

- **Python**: `ms-python.python`
- **Pylance**: `ms-python.vscode-pylance`
- **ESLint**: `dbaeumer.vscode-eslint`
- **Prettier**: `esbenp.prettier-vscode`

Python and Pylance are required for the backend development experience. ESLint and Prettier are recommended for the React frontend.

## Backend setup

From the project root on Windows PowerShell:

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
Copy-Item .env.example .env
```

Edit `.env` and set real values:

```env
SECRET_KEY=use-a-long-random-secret
GEMINI_API_KEY=your-gemini-api-key
DATABASE_URL=sqlite:///./jobportal.db
```

Start the API:

```powershell
.\.venv\Scripts\Activate.ps1
uvicorn main:app --reload
```

Backend URLs:

- API: `http://127.0.0.1:8000`
- Swagger docs: `http://127.0.0.1:8000/docs`
- OpenAPI schema: `http://127.0.0.1:8000/openapi.json`

## Frontend setup

Open a second terminal:

```powershell
cd frontend
npm install
npm run dev
```

Frontend URL:

```text
http://127.0.0.1:5173
```

The frontend calls the backend at `http://127.0.0.1:8000` by default. To use another API URL, create `frontend/.env`:

```env
VITE_API_URL=http://127.0.0.1:8000
```

Create a production frontend build:

```powershell
cd frontend
npm run build
npm run preview
```

## API endpoints

### Authentication

| Method | Endpoint | Access |
|---|---|---|
| `POST` | `/login` | Public |
| `GET` | `/me` | Authenticated |

Use the login response token on protected requests:

```text
Authorization: Bearer <access_token>
```

### Users

| Method | Endpoint | Access |
|---|---|---|
| `POST` | `/users` | Public registration |
| `GET` | `/users` | Recruiter |
| `GET` | `/users/{user_id}` | Own user or recruiter |
| `GET` | `/users/{user_id}/jobs` | Own user or recruiter |
| `PUT` | `/users/{user_id}` | Own user |
| `DELETE` | `/users/{user_id}` | Own user |
| `GET` | `/users/{user_id}/applications` | Own user or recruiter |

### Jobs

| Method | Endpoint | Access |
|---|---|---|
| `POST` | `/jobs` | Recruiter |
| `GET` | `/jobs` | Public |
| `GET` | `/jobs/{job_id}` | Public |
| `PUT` | `/jobs/{job_id}` | Owning recruiter |
| `DELETE` | `/jobs/{job_id}` | Owning recruiter |

### Applications

| Method | Endpoint | Access |
|---|---|---|
| `POST` | `/applications?job_id={job_id}` | Job seeker with PDF resume |
| `GET` | `/applications` | Authenticated, scoped by role |
| `GET` | `/applications/{application_id}` | Applicant or owning recruiter |
| `GET` | `/applications/{application_id}/details` | Applicant or owning recruiter |
| `GET` | `/jobs/{job_id}/applications` | Owning recruiter |
| `PUT` | `/applications/{application_id}/status` | Owning recruiter |
| `PUT` | `/applications/{application_id}/resume` | Owning job seeker |

The application upload uses `multipart/form-data` with a `resume` PDF file.

### Resume and AI features

| Method | Endpoint | Access |
|---|---|---|
| `GET` | `/resume-text/{application_id}` | Applicant or owning recruiter |
| `GET` | `/resume-analysis/{application_id}` | Applicant or owning recruiter |
| `GET` | `/applications/{application_id}/match` | Applicant or owning recruiter |
| `GET` | `/recommended-jobs` | Job seeker |
| `GET` | `/recruiter/jobs/{job_id}/summary` | Owning recruiter |

AI endpoints require a valid `GEMINI_API_KEY` and may take longer than normal API requests.

## Frontend features

- Public job and internship browsing
- Keyword and location search
- All roles and internships tabs
- Job detail view with requirements and specifications
- Job seeker sign-up, login, logout, PDF applications, and application history
- Recruiter sign-up, login, logout, role publishing, owned-role listing, applicant review, and status updates
- Saved jobs stored in browser local storage

## GitHub safety

Do not commit these files or folders:

- `.env`
- `.venv/`
- `jobportal.db`
- `resumes/`
- `frontend/node_modules/`
- `frontend/dist/`

These paths are already covered by `.gitignore`. Commit `.env.example` instead of `.env`.
