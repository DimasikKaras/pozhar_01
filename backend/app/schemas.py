import re
from datetime import date as date_type
from typing import Optional, Any
from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator
from .models import EquipmentStatusEnum, InspectionResultEnum, RiskLevelEnum, RoleEnum

class TokenPairResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"

class InspectorBase(BaseModel):
    full_name: str
    rank: str
    phone: Optional[str] = None
    email: EmailStr
    role: RoleEnum = RoleEnum.inspector

class InspectorRegister(InspectorBase):
    password: str = Field(min_length=6)
    admin_code: Optional[str] = None

class InspectorUpdate(BaseModel):
    full_name: Optional[str] = None
    rank: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[EmailStr] = None
    role: Optional[RoleEnum] = None
    password: Optional[str] = None

class InspectorOut(InspectorBase):
    id: int
    model_config = ConfigDict(from_attributes=True)

class LoginRequest(BaseModel):
    email: EmailStr
    password: str

class InspectionBase(BaseModel):
    facility_id: int
    inspector_id: Optional[int] = None
    date: date_type
    result: str
    violations: Optional[str] = ""
    prescription_number: Optional[str] = ""

class InspectionCreate(InspectionBase):
    pass

class InspectionUpdate(BaseModel):
    date: Optional[date_type] = None
    result: Optional[str] = None
    violations: Optional[str] = None
    prescription_number: Optional[str] = None

class InspectionOut(InspectionBase):
    id: int
    inspector_id: int
    model_config = ConfigDict(from_attributes=True)

class FacilityBase(BaseModel):
    name: str
    address: str
    risk_level: RiskLevelEnum
    cadastral_number: Optional[str] = None
    responsible_person: Optional[str] = None

class FacilityCreate(FacilityBase):
    pass

class FacilityUpdate(BaseModel):
    name: Optional[str] = None
    address: Optional[str] = None
    risk_level: Optional[RiskLevelEnum] = None
    cadastral_number: Optional[str] = None
    responsible_person: Optional[str] = None

class FacilityOut(FacilityBase):
    id: int
    model_config = ConfigDict(from_attributes=True)

class EquipmentBase(BaseModel):
    facility_id: int
    name: Optional[str] = ""
    type: str
    serial_number: Optional[str] = ""
    status: Any = "Исправен"
    last_check_date: Any = None
    next_check_date: Optional[Any] = None
    notes: Optional[str] = ""

class EquipmentCreate(BaseModel):
    facility_id: int
    name: Optional[str] = ""
    type: str
    serial_number: Optional[str] = ""
    status: Optional[str] = "Исправен"
    last_check_date: Optional[Any] = None
    next_check_date: Optional[Any] = None
    notes: Optional[str] = ""

class EquipmentUpdate(BaseModel):
    facility_id: Optional[int] = None
    name: Optional[str] = None
    type: Optional[str] = None
    serial_number: Optional[str] = None
    status: Optional[str] = None
    last_check_date: Optional[Any] = None
    next_check_date: Optional[Any] = None
    notes: Optional[str] = None

class EquipmentOut(BaseModel):
    id: int
    facility_id: int
    name: Optional[str] = ""
    type: str
    serial_number: Optional[str] = ""
    status: Any = "Исправен"
    last_check_date: Any = None
    next_check_date: Optional[Any] = None
    notes: Optional[str] = ""
    model_config = ConfigDict(from_attributes=True)
