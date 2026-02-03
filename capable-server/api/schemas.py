from pydantic import BaseModel, EmailStr
from datetime import datetime, time
from typing import Any
from uuid import UUID


# Auth schemas
class UserSignUp(BaseModel):
    email: EmailStr
    password: str


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class AuthResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user_id: str
    email: str


# Experiment schemas
class ExperimentCreate(BaseModel):
    name: str
    description: str | None = None
    organism_type: str | None = None
    parameters: dict[str, Any] | None = None
    logs: list[dict[str, Any]] | None = None
    peptides: list[str] | None = None
    experiment_start: time | None = None
    experiment_end: time | None = None
    links: dict[str, Any] | None = None
    olden_labs_study_id: int | None = None


class ExperimentUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    organism_type: str | None = None
    parameters: dict[str, Any] | None = None
    logs: list[dict[str, Any]] | None = None
    peptides: list[str] | None = None
    experiment_start: time | None = None
    experiment_end: time | None = None
    links: dict[str, Any] | None = None
    olden_labs_study_id: int | None = None


class ExperimentResponse(BaseModel):
    id: UUID
    row_created_at: datetime
    name: str
    description: str | None = None
    organism_type: str | None = None
    parameters: dict[str, Any] | None = None
    logs: list[dict[str, Any]] | None = None
    peptides: list[str] | None = None
    experiment_start: time | None = None
    experiment_end: time | None = None
    links: dict[str, Any] | None = None
    olden_labs_study_id: int | None = None
