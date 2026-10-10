from datetime import datetime, date
from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator

class RegisterRequest(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    email: EmailStr
    password: str = Field(min_length=10, max_length=128)

class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=128)

class UserResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    name: str
    email: str
    created_at: datetime


class RegisterResponse(BaseModel):
    user: UserResponse
    message: str


class UpdateMeRequest(BaseModel):
    name: str = Field(min_length=1, max_length=120)


class SummaryGenerateRequest(BaseModel):
    record_ids: list[int] | None = None


class SummaryFromTextRequest(BaseModel):
    """Free text (e.g. OCR output) to summarize without saving a record."""

    text: str = Field(min_length=1, max_length=20000)
    title: str | None = Field(default=None, max_length=255)

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in_seconds: int
    user: UserResponse

class RecordInput(BaseModel):
    category: str = Field(min_length=1, max_length=60)
    title: str = Field(min_length=1, max_length=255)
    event_date: date | None = None
    details: str = Field(min_length=1, max_length=10000)

    @field_validator("category")
    @classmethod
    def normalize_category(cls, value: str) -> str:
        value = value.strip().lower()
        allowed = {"medication", "lab_result", "diagnosis", "visit", "allergy", "procedure", "medical_document", "other"}
        if value not in allowed:
            raise ValueError(f"category must be one of: {', '.join(sorted(allowed))}")
        return value

class VerifyDocumentRequest(BaseModel):
    records: list[RecordInput] = Field(min_length=1, max_length=100)

class CreateRecordRequest(RecordInput):
    document_id: int | None = None

class ShareCreateRequest(BaseModel):
    record_ids: list[int] = Field(min_length=1, max_length=200)
    expires_in_hours: int = Field(default=24, ge=1, le=168)

class VerifyPinRequest(BaseModel):
    pin: str = Field(pattern=r"^\d{6}$")

class RecordUpdate(BaseModel):
    category: str | None = Field(default=None, min_length=1, max_length=60)
    title: str | None = Field(default=None, min_length=1, max_length=255)
    event_date: date | None = None
    details: str | None = Field(default=None, min_length=1, max_length=10000)
