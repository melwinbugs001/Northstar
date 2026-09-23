from pydantic import BaseModel, Field, EmailStr
from enum import Enum
from typing import Literal


class UserRole(str, Enum):
    job_seeker = "job_seeker"
    recruiter = "recruiter"
    admin = "admin"


class UserCreate(BaseModel):
    name: str = Field(min_length=2)
    email: EmailStr
    password: str = Field(min_length=8)
    role: Literal["job_seeker", "recruiter", "admin"] = "job_seeker"

class UserUpdate(BaseModel):
    name: str = Field(min_length=2)
    email: EmailStr
    role: Literal["job_seeker", "recruiter", "admin"]
class JobCreate(BaseModel):
    title: str = Field(min_length=1)
    description: str = Field(min_length=1)
    company: str = Field(min_length=1)
    location: str = Field(min_length=1)
    salary: int = Field(ge=0)

class AdminUserCreate(BaseModel):
    name: str
    email: EmailStr
    password: str
    role: Literal["job_seeker", "recruiter", "admin"]

class JobUpdate(BaseModel):
    title: str = Field(min_length=1)
    description: str = Field(min_length=1)
    company: str = Field(min_length=1)
    location: str = Field(min_length=1)
    salary: int = Field(ge=0)

class ApplicationStatus(str, Enum):
    applied = "applied"
    shortlisted = "shortlisted"
    interview = "interview"
    selected = "selected"
    rejected = "rejected"


class ApplicationStatusUpdate(BaseModel):
    status: ApplicationStatus


class LoginRequest(BaseModel):
    email: str
    password: str