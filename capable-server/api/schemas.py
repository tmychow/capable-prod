from pydantic import BaseModel, EmailStr
from datetime import datetime, timezone
from typing import Any
from uuid import UUID


def ensure_utc(dt: datetime | None) -> datetime | None:
    """Ensure a datetime has UTC timezone. Naive datetimes are assumed UTC."""
    if dt is None:
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt


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
    groups: list[dict[str, Any]] | None = None
    additional_parameters: dict[str, Any] | None = None
    logs: list[dict[str, Any]] | None = None
    peptides: list[str] | None = None
    experiment_start: datetime | None = None
    experiment_end: datetime | None = None
    links: dict[str, Any] | None = None
    olden_labs_study_id: int | None = None


class ExperimentUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    organism_type: str | None = None
    groups: list[dict[str, Any]] | None = None
    additional_parameters: dict[str, Any] | None = None
    logs: list[dict[str, Any]] | None = None
    peptides: list[str] | None = None
    experiment_start: datetime | None = None
    experiment_end: datetime | None = None
    links: dict[str, Any] | None = None
    olden_labs_study_id: int | None = None


class ExperimentResponse(BaseModel):
    id: UUID
    row_created_at: datetime
    name: str
    description: str | None = None
    organism_type: str | None = None
    groups: list[dict[str, Any]] | None = None
    additional_parameters: dict[str, Any] | None = None
    logs: list[dict[str, Any]] | None = None
    peptides: list[str] | None = None
    experiment_start: datetime | None = None
    experiment_end: datetime | None = None
    links: dict[str, Any] | None = None
    olden_labs_study_id: int | None = None
