from datetime import datetime
from pydantic import BaseModel


class ProfileField(BaseModel):
    id: str
    fieldKey: str
    value: str
    provenance: str          # 'suggested' | 'confirmed'
    sourceEncounterId: str | None = None
    confirmedBy: str | None = None
    updated: datetime
    isCurrent: bool
    history: list["ProfileField"] = []

    class Config:
        from_attributes = True


ProfileField.model_rebuild()


class PatientProfile(BaseModel):
    patientId: str
    fields: list[ProfileField]


class Patient(BaseModel):
    id: str
    name: str
    dob: str | None = None
    credibleClientId: str | None = None
    created: datetime
    modified: datetime
    inactivated: datetime | None = None

    class Config:
        from_attributes = True


class PatientCreate(BaseModel):
    name: str
    dob: str | None = None
    credibleClientId: str | None = None


class PatientUpdate(BaseModel):
    name: str | None = None
    dob: str | None = None
    credibleClientId: str | None = None
