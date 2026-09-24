from fastapi import FastAPI, Depends, HTTPException, UploadFile, File, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import (
    HTTPBearer,
    HTTPAuthorizationCredentials
)
from google import genai
from google.genai import types
from sqlalchemy.orm import Session
from auth import (
    hash_password,
    verify_password,
    create_access_token,
    verify_token
)
from database import Base, engine, SessionLocal
from pypdf import PdfReader
import models
import schemas
import os
import uuid
import json
import numpy as np
from dotenv import load_dotenv

load_dotenv()

gemini_client = genai.Client(
    api_key=os.getenv("GEMINI_API_KEY")
)

app = FastAPI()
security = HTTPBearer(auto_error=False)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
Base.metadata.create_all(bind=engine)


def get_db():
    db = SessionLocal()

    try:
        yield db
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()

def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(security),
    db: Session = Depends(get_db)
):
    if credentials is None:
        raise HTTPException(status_code=401, detail="Authentication required")

    token = credentials.credentials

    payload = verify_token(token)

    if payload is None:
        raise HTTPException(
            status_code=401,
            detail="Invalid or expired token"
        )

    user_id = payload.get("user_id")

    if user_id is None:
        raise HTTPException(
            status_code=401,
            detail="Invalid token"
        )

    user = db.query(models.User).filter(
        models.User.id == user_id
    ).first()

    if user is None:
        raise HTTPException(
            status_code=401,
            detail="User not found"
        )

    return user


@app.get("/me")
def get_my_profile(
    current_user: models.User = Depends(get_current_user)
):
    return {
        "id": current_user.id,
        "name": current_user.name,
        "email": current_user.email,
        "role": current_user.role
    }


@app.post("/login")
def login(
    login_data: schemas.LoginRequest,
    db: Session = Depends(get_db)
):
    user = db.query(models.User).filter(
        models.User.email == login_data.email
    ).first()

    if user is None:
        raise HTTPException(
            status_code=401,
            detail="Invalid email or password"
        )

    if not verify_password(
        login_data.password,
        user.password
    ):
        raise HTTPException(
            status_code=401,
            detail="Invalid email or password"
        )

    token_data = {
        "user_id": user.id,
        "role": user.role
    }

    access_token = create_access_token(token_data)

    return {
        "access_token": access_token,
        "token_type": "bearer"
    }

@app.post("/users")
def create_user(
    user: schemas.UserCreate,
    db: Session = Depends(get_db)
):
    new_user = models.User(
        name=user.name,
        email=user.email,
        password=hash_password(user.password),
        role=user.role
    )

    if db.query(models.User).filter(models.User.email == user.email).first():
        raise HTTPException(status_code=409, detail="Email is already registered")

    db.add(new_user)
    try:
        db.commit()
    except Exception:
        db.rollback()
        raise HTTPException(status_code=409, detail="Email is already registered")
    db.refresh(new_user)

    return {
        "id": new_user.id,
        "name": new_user.name,
        "email": new_user.email,
        "role": new_user.role
    }

@app.post("/jobs")
def create_job(
    job: schemas.JobCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    if current_user.role != "recruiter":
        raise HTTPException(
            status_code=403,
            detail="Only recruiters can create jobs"
        )

    new_job = models.Job(
        title=job.title,
        description=job.description,
        company=job.company,
        location=job.location,
        salary=job.salary,
        recruiter_id=current_user.id
    )

    db.add(new_job)
    db.commit()
    db.refresh(new_job)

    return new_job

@app.get("/users")
def get_users(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    if current_user.role != "recruiter":
        raise HTTPException(status_code=403, detail="Only recruiters can list users")

    users = db.query(models.User).all()
    return [
        {
            "id": user.id,
            "name": user.name,
            "email": user.email,
            "role": user.role
        }
        for user in users
    ]

@app.get("/users/{user_id}")
def get_user(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    if current_user.id != user_id and current_user.role != "recruiter":
        raise HTTPException(status_code=403, detail="You can only view your own profile")

    user = db.query(models.User).filter(
        models.User.id == user_id
    ).first()

    if user is None:
        raise HTTPException(status_code=404, detail="User not found")

    return {
    "id": user.id,
    "name": user.name,
    "email": user.email,
    "role": user.role
}

@app.get("/users/{user_id}/jobs")
def get_user_jobs(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    if current_user.id != user_id and current_user.role != "recruiter":
        raise HTTPException(status_code=403, detail="You can only view your own jobs")

    user = db.query(models.User).filter(
        models.User.id == user_id
    ).first()

    if user is None:
        raise HTTPException(status_code=404, detail="User not found")

    return user.jobs


@app.get("/jobs")
def get_jobs(db: Session = Depends(get_db)):
    jobs = db.query(models.Job).all()
    return jobs

@app.get("/jobs/{job_id}")
def get_job(
    job_id: int,
    db: Session = Depends(get_db)
):
    job = db.query(models.Job).filter(
        models.Job.id == job_id
    ).first()

    if job is None:
        return {"message": "Job not found"}

    return job

@app.put("/users/{user_id}")
def update_user(
    user_id: int,
    user: schemas.UserUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    if current_user.id != user_id:
        raise HTTPException(status_code=403, detail="You can only update your own profile")

    existing_user = db.query(models.User).filter(
        models.User.id == user_id
    ).first()

    if existing_user is None:
        raise HTTPException(
            status_code=404,
            detail="User not found"
        )

    existing_user.name = user.name
    email_owner = db.query(models.User).filter(
        models.User.email == user.email,
        models.User.id != user_id
    ).first()
    if email_owner:
        raise HTTPException(status_code=409, detail="Email is already registered")

    existing_user.email = user.email

    db.commit()
    db.refresh(existing_user)

    return {
        "id": existing_user.id,
        "name": existing_user.name,
        "email": existing_user.email,
        "role": existing_user.role
    }

@app.delete("/users/{user_id}")
def delete_user(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    if current_user.id != user_id:
        raise HTTPException(status_code=403, detail="You can only delete your own account")

    existing_user = db.query(models.User).filter(
        models.User.id == user_id
    ).first()

    if existing_user is None:
        raise HTTPException(status_code=404, detail="User not found")

    db.delete(existing_user)
    db.commit()

    return {
        "message": "User deleted successfully"
    }


@app.get("/recommended-jobs")
def recommend_jobs(
    min_match: float = Query(
        50,
        ge=0,
        le=100
    ),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    # Only job seekers can get recommendations  
    if current_user.role != "job_seeker":
        raise HTTPException(
            status_code=403,
            detail="Only job seekers can get job recommendations"
        )

    # Find the user's latest application
    application = db.query(models.Application).filter(
        models.Application.user_id == current_user.id
    ).order_by(
        models.Application.id.desc()
    ).first()

    if application is None:
        raise HTTPException(
            status_code=404,
            detail="Please upload a resume first"
        )

    # Extract resume text
    resume_text = extract_resume_text(application.resume)
    resume_text = clean_resume_text(resume_text)

    # Create resume embedding once
    resume_embedding = get_embedding(resume_text)

    # Get all jobs
    jobs = db.query(models.Job).all()

    recommendations = []

    for job in jobs:

        # Create job embedding
        job_embedding = get_embedding(job.description)

        # Calculate similarity
        similarity = cosine_similarity(
            resume_embedding,
            job_embedding
        )

        match_percentage = round(
            similarity * 100,
            2
        )

        if match_percentage >= min_match:
            recommendations.append({
                "job_id": job.id,
                "title": job.title,
                "company": job.company,
                "location": job.location,
                "match_percentage": match_percentage
            })

    # Sort highest match first
    recommendations.sort(
        key=lambda x: x["match_percentage"],
        reverse=True
    )

    return {
        "resume_application_id": application.id,
        "recommendations": recommendations
    }

@app.put("/jobs/{job_id}")
def update_job(
    job_id: int,
    job: schemas.JobUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    if current_user.role != "recruiter":
        raise HTTPException(status_code=403, detail="Only recruiters can update jobs")

    existing_job = db.query(models.Job).filter(
        models.Job.id == job_id
    ).first()

    if existing_job is None:
        raise HTTPException(status_code=404, detail="Job not found")

    if existing_job.recruiter_id != current_user.id:
        raise HTTPException(status_code=403, detail="You can only update your own jobs")

    existing_job.title = job.title
    existing_job.description = job.description
    existing_job.company = job.company
    existing_job.location = job.location
    existing_job.salary = job.salary

    db.commit()
    db.refresh(existing_job)

    return existing_job

@app.delete("/jobs/{job_id}")
def delete_job(
    job_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    if current_user.role != "recruiter":
        raise HTTPException(status_code=403, detail="Only recruiters can delete jobs")

    existing_job = db.query(models.Job).filter(
        models.Job.id == job_id
    ).first()

    if existing_job is None:
        raise HTTPException(status_code=404, detail="Job not found")

    if existing_job.recruiter_id != current_user.id:
        raise HTTPException(status_code=403, detail="You can only delete your own jobs")

    db.delete(existing_job)
    db.commit()

    return {
        "message": "Job deleted successfully"
    }

@app.get("/applications")
def get_applications(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    if current_user.role == "recruiter":
        applications = db.query(models.Application).join(models.Job).filter(
            models.Job.recruiter_id == current_user.id
        ).all()
    else:
        applications = db.query(models.Application).filter(
            models.Application.user_id == current_user.id
        ).all()
    return applications

def extract_resume_text(file_path):
    reader = PdfReader(file_path)

    text = ""

    for page in reader.pages:
        text += page.extract_text() or ""

    return text

def clean_resume_text(text):
    lines = text.splitlines()
    clean_lines = []

    for line in lines:
        line = line.strip()

        if line:
            clean_lines.append(line)

    return "\n".join(clean_lines)

def analyze_resume_with_ai(resume_text: str):
    try:
        prompt = f"""
Analyze the following resume and extract the important information.

Resume:
{resume_text}

Return the result as JSON with these fields:
- name
- skills
- education
- projects
- certifications
- experience
"""

        response = gemini_client.models.generate_content(
            model="gemini-3.5-flash-lite",
            contents=prompt,
            config=types.GenerateContentConfig(
                response_mime_type="application/json"
            )
        )

        return json.loads(response.text)

    except Exception:
        raise HTTPException(
            status_code=503,
            detail="AI resume analysis service is temporarily unavailable"
        )

def compare_resume_with_job(
    resume_text: str,
    job_description: str
):
    try:
        prompt = f"""
Compare this resume with this job description.

RESUME:
{resume_text}

JOB DESCRIPTION:
{job_description}

Return JSON with exactly these fields:

{{
    "matched_skills": [],
    "missing_skills": []
}}

Only include technical skills, tools, frameworks, programming languages,
databases, and technologies.

Do not invent skills that are not present in either the resume or job description.
"""

        response = gemini_client.models.generate_content(
            model="gemini-3.5-flash-lite",
            contents=prompt,
            config=types.GenerateContentConfig(
                response_mime_type="application/json"
            )
        )

        return json.loads(response.text)

    except Exception:
        raise HTTPException(
            status_code=503,
            detail="AI skill comparison service is temporarily unavailable"
        )

def generate_match_explanation(
    resume_text: str,
    job_description: str,
    matched_skills: list,
    missing_skills: list
):
    try:
        prompt = f"""
Explain why this candidate matches this job.

RESUME:
{resume_text}

JOB DESCRIPTION:
{job_description}

MATCHED SKILLS:
{matched_skills}

MISSING SKILLS:
{missing_skills}

Return JSON with exactly these fields:

{{
    "explanation": "",
    "strengths": [],
    "improvements": []
}}

Keep the explanation short and professional.
Do not invent information that is not present in the resume or job description.
"""

        response = gemini_client.models.generate_content(
            model="gemini-3.5-flash-lite",
            contents=prompt,
            config=types.GenerateContentConfig(
                response_mime_type="application/json"
            )
        )

        return json.loads(response.text)

    except Exception:
        raise HTTPException(
            status_code=503,
            detail="AI match explanation service is temporarily unavailable"
        )

@app.get("/recruiter/jobs/{job_id}/summary")
def recruiter_job_summary(
    job_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    # Only recruiters can access this
    if current_user.role != "recruiter":
        raise HTTPException(
            status_code=403,
            detail="Only recruiters can view application summaries"
        )

    # Find the job
    job = db.query(models.Job).filter(
        models.Job.id == job_id
    ).first()

    if job is None:
        raise HTTPException(
            status_code=404,
            detail="Job not found"
        )

    # Make sure recruiter owns this job
    if job.recruiter_id != current_user.id:
        raise HTTPException(
            status_code=403,
            detail="You can only view summaries for your own jobs"
        )

    # Get applications
    applications = db.query(models.Application).filter(
        models.Application.job_id == job_id
    ).all()

    result = []

    for application in applications:
        resume_text = extract_resume_text(application.resume)
        resume_text = clean_resume_text(resume_text)

        resume_embedding = get_embedding(resume_text)
        job_embedding = get_embedding(job.description)

        similarity = cosine_similarity(
            resume_embedding,
            job_embedding
        )

        match_percentage = round(
            similarity * 100,
            2
        )

        skill_comparison = compare_resume_with_job(
        resume_text,
        job.description
    )
    match_explanation = generate_match_explanation(
    resume_text,
    job.description,
    skill_comparison["matched_skills"],
    skill_comparison["missing_skills"]
)

    result.append({
    "application_id": application.id,
    "candidate_name": application.user.name,
    "candidate_email": application.user.email,
    "status": application.status,
    "match_percentage": match_percentage,
    "matched_skills": skill_comparison["matched_skills"],
    "missing_skills": skill_comparison["missing_skills"],
    "explanation": match_explanation["explanation"],
    "strengths": match_explanation["strengths"],
    "improvements": match_explanation["improvements"]
})

    result.sort(
        key=lambda x: x["match_percentage"],
        reverse=True
    )


    return {
        "job_id": job.id,
        "job_title": job.title,
        "total_applications": len(applications),
        "applications": result
    }
 
def get_embedding(text: str):
    response = gemini_client.models.embed_content(
        model="gemini-embedding-2",
        contents=text
    )

    return response.embeddings[0].values  

def cosine_similarity(vector1, vector2):
    vector1 = np.array(vector1)
    vector2 = np.array(vector2)

    similarity = np.dot(vector1, vector2) / (
        np.linalg.norm(vector1) * np.linalg.norm(vector2)
    )

    return similarity

@app.post("/applications")
def create_application(
    job_id: int,
    resume: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    # Only job seekers can apply
    if current_user.role != "job_seeker":
        raise HTTPException(
            status_code=403,
            detail="Only job seekers can apply for jobs"
        )

    # Check if job exists
    job = db.query(models.Job).filter(
        models.Job.id == job_id
    ).first()

    if job is None:
        raise HTTPException(
            status_code=404,
            detail="Job not found"
        )

    # Prevent duplicate applications
    existing_application = db.query(models.Application).filter(
        models.Application.job_id == job_id,
        models.Application.user_id == current_user.id
    ).first()

    if existing_application:
        raise HTTPException(
            status_code=400,
            detail="You have already applied for this job"
        )

    # Check file type
    filename = resume.filename or ""
    if resume.content_type != "application/pdf" or not filename.lower().endswith(".pdf"):
        raise HTTPException(
            status_code=400,
            detail="Only PDF resumes are allowed"
        )

    # Save the uploaded file
    os.makedirs("resumes", exist_ok=True)
    file_extension = os.path.splitext(filename)[1].lower()

    unique_filename = f"{uuid.uuid4()}{file_extension}"

    file_path = f"resumes/{unique_filename}"

    file_content = resume.file.read(5 * 1024 * 1024 + 1)

    if len(file_content) > 5 * 1024 * 1024:
        raise HTTPException(
            status_code=400,
            detail="Resume file must be smaller than 5 MB"
        )

    if not file_content.startswith(b"%PDF"):
        raise HTTPException(status_code=400, detail="Uploaded file is not a valid PDF")

    with open(file_path, "wb") as file:
        file.write(file_content)

    # Create application
    new_application = models.Application(
        job_id=job_id,
        user_id=current_user.id,
        resume=file_path,
        status="applied"
    )

    db.add(new_application)
    try:
        db.commit()
    except Exception:
        db.rollback()
        if os.path.exists(file_path):
            os.remove(file_path)
        raise HTTPException(status_code=500, detail="Could not save application")
    db.refresh(new_application)

    return new_application


@app.get("/applications/{application_id}")
def get_application(
    application_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    application = db.query(models.Application).filter(
        models.Application.id == application_id
    ).first()

    if application is None:
        raise HTTPException(status_code=404, detail="Application not found")

    if (
        application.user_id != current_user.id
        and application.job.recruiter_id != current_user.id
    ):
        raise HTTPException(status_code=403, detail="You cannot view this application")

    return application

@app.put("/applications/{application_id}/status")
def update_application_status(
    application_id: int,
    status_data: schemas.ApplicationStatusUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    # Only recruiters can update application status
    if current_user.role != "recruiter":
        raise HTTPException(
            status_code=403,
            detail="Only recruiters can update application status"
        )

    # Find application
    application = db.query(models.Application).filter(
        models.Application.id == application_id
    ).first()

    if application is None:
        raise HTTPException(
            status_code=404,
            detail="Application not found"
        )

    # Check whether the job belongs to this recruiter
    if application.job.recruiter_id != current_user.id:
        raise HTTPException(
            status_code=403,
            detail="You can only update applications for your own jobs"
        )

    application.status = status_data.status.value

    db.commit()
    db.refresh(application)

    return application
@app.get("/users/{user_id}/applications")
def get_user_applications(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    if current_user.id != user_id and current_user.role != "recruiter":
        raise HTTPException(status_code=403, detail="You can only view your own applications")

    user = db.query(models.User).filter(
        models.User.id == user_id
    ).first()

    if user is None:
        raise HTTPException(status_code=404, detail="User not found")

    applications = db.query(models.Application).filter(
        models.Application.user_id == user_id
    ).join(models.Job, models.Job.id == models.Application.job_id).all()

    return [
        {
            "id": application.id,
            "job_id": application.job_id,
            "job_title": application.job.title,
            "company": application.job.company,
            "location": application.job.location,
            "status": application.status,
        }
        for application in applications
    ]

@app.get("/applications/{application_id}/details")
def get_application_details(
    application_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    application = db.query(models.Application).filter(
        models.Application.id == application_id
    ).first()

    if application is None:
        raise HTTPException(status_code=404, detail="Application not found")

    if (
        application.user_id != current_user.id
        and application.job.recruiter_id != current_user.id
    ):
        raise HTTPException(status_code=403, detail="You cannot view this application")

    return {
        "application_id": application.id,
        "status": application.status,
        "resume": application.resume,
        "user_name": application.user.name,
        "user_email": application.user.email,
        "job_title": application.job.title,
        "company": application.job.company
    }

@app.get("/jobs/{job_id}/applications")
def get_job_applications(
    job_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    # Only recruiters can view applications
    if current_user.role != "recruiter":
        raise HTTPException(
            status_code=403,
            detail="Only recruiters can view applications"
        )

    # Find the job
    job = db.query(models.Job).filter(
        models.Job.id == job_id
    ).first()

    if job is None:
        raise HTTPException(
            status_code=404,
            detail="Job not found"
        )

    # Recruiter can only view applications for their own job
    if job.recruiter_id != current_user.id:
        raise HTTPException(
            status_code=403,
            detail="You can only view applications for your own jobs"
        )

    return job.applications
@app.get("/resume-text/{application_id}")
def get_resume_text(
    application_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    application = db.query(models.Application).filter(
        models.Application.id == application_id
    ).first()

    if application is None:
        raise HTTPException(
            status_code=404,
            detail="Application not found"
        )

    # Job seeker can view their own resume
    if current_user.role == "job_seeker":
        if application.user_id != current_user.id:
            raise HTTPException(
                status_code=403,
                detail="You can only view your own resume"
            )

    # Recruiter can view resumes for their own jobs
    elif current_user.role == "recruiter":
        if application.job.recruiter_id != current_user.id:
            raise HTTPException(
                status_code=403,
                detail="You can only view resumes for your own jobs"
            )

    text = extract_resume_text(application.resume)
    text = clean_resume_text(text)

    return {
        "application_id": application.id,
        "resume_file": application.resume,
        "resume_text": text
    }


@app.get("/resume-analysis/{application_id}")
def resume_analysis(
    application_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    application = db.query(models.Application).filter(
        models.Application.id == application_id
    ).first()

    if application is None:
        raise HTTPException(
            status_code=404,
            detail="Application not found"
        )

    # Job seeker can analyze their own resume
    if current_user.role == "job_seeker":
        if application.user_id != current_user.id:
            raise HTTPException(
                status_code=403,
                detail="You can only analyze your own resume"
            )

    # Recruiter can analyze resumes for their own jobs
    elif current_user.role == "recruiter":
        if application.job.recruiter_id != current_user.id:
            raise HTTPException(
                status_code=403,
                detail="You can only analyze resumes for your own jobs"
            )

    # Extract resume text
    text = extract_resume_text(application.resume)
    text = clean_resume_text(text)

    # Send resume text to Gemini
    analysis_data = analyze_resume_with_ai(text)

    return {
        "application_id": application.id,
        "analysis": analysis_data
    }

@app.get("/applications/{application_id}/match")
def match_resume_with_job(
    application_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    # Find application
    application = db.query(models.Application).filter(
        models.Application.id == application_id
    ).first()

    if application is None:
        raise HTTPException(
            status_code=404,
            detail="Application not found"
        )

    # Job seeker can view their own match
    if current_user.role == "job_seeker":
        if application.user_id != current_user.id:
            raise HTTPException(
                status_code=403,
                detail="You can only view your own match"
            )

    # Recruiter can view matches for their own jobs
    elif current_user.role == "recruiter":
        if application.job.recruiter_id != current_user.id:
            raise HTTPException(
                status_code=403,
                detail="You can only view matches for your own jobs"
            )

    # Extract resume text
    resume_text = extract_resume_text(application.resume)
    resume_text = clean_resume_text(resume_text)

    # Get job description
    job_description = application.job.description

    # Create embeddings
    resume_embedding = get_embedding(resume_text)
    job_embedding = get_embedding(job_description)

    # Calculate similarity
   # Calculate similarity
    similarity = cosine_similarity(
        resume_embedding,
        job_embedding
    )


    # Compare resume skills with job requirements
    skill_comparison = compare_resume_with_job(
        resume_text,
        job_description
    )
    match_explanation = generate_match_explanation(
    resume_text,
    job_description,
    skill_comparison["matched_skills"],
    skill_comparison["missing_skills"]
)

    # Convert to percentage for display
    match_percentage = round(similarity * 100, 2)

    return {
    "application_id": application.id,
    "job_id": application.job.id,
    "job_title": application.job.title,
    "similarity_score": round(similarity, 4),
    "match_percentage": match_percentage,
    "matched_skills": skill_comparison["matched_skills"],
    "missing_skills": skill_comparison["missing_skills"],
    "explanation": match_explanation["explanation"],
    "strengths": match_explanation["strengths"],
    "improvements": match_explanation["improvements"]
}


@app.put("/applications/{application_id}/resume")
def update_resume(
    application_id: int,
    resume: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    # Only job seekers can update their resume
    if current_user.role != "job_seeker":
        raise HTTPException(
            status_code=403,
            detail="Only job seekers can update resumes"
        )

    # Find application
    application = db.query(models.Application).filter(
        models.Application.id == application_id
    ).first()

    if application is None:
        raise HTTPException(
            status_code=404,
            detail="Application not found"
        )

    # Make sure this application belongs to the logged-in user
    if application.user_id != current_user.id:
        raise HTTPException(
            status_code=403,
            detail="You can only update your own resume"
        )

    # Only PDF files allowed
    if not resume.filename.lower().endswith(".pdf"):
        raise HTTPException(
            status_code=400,
            detail="Only PDF resumes are allowed"
        )

    # Make sure resumes folder exists
    os.makedirs("resumes", exist_ok=True)

    # Create unique filename
    file_extension = os.path.splitext(resume.filename)[1]
    unique_filename = f"{uuid.uuid4()}{file_extension}"
    file_path = f"resumes/{unique_filename}"

    # Save new resume
    file_content = resume.file.read()

    if len(file_content) > 5 * 1024 * 1024:
        raise HTTPException(
            status_code=400,
            detail="Resume file must be smaller than 5 MB"
        )

    with open(file_path, "wb") as file:
        file.write(file_content)

    # Store new path in database
    application.resume = file_path

    db.commit()
    db.refresh(application)

    return {
        "message": "Resume updated successfully",
        "application_id": application.id,
        "resume": application.resume
    }   

test_embedding = get_embedding(
    "Python FastAPI developer with SQLAlchemy experience"
)

print("Embedding length:", len(test_embedding))
print("First 5 values:", test_embedding[:5])