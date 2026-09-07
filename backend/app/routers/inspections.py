from fastapi import APIRouter, Depends, HTTPException, status, Response
from sqlalchemy import select
from sqlalchemy.orm import Session
from datetime import date
from ..database import get_db
from ..deps import get_current_user
from ..models import Facility, Inspection, Inspector, RiskLevelEnum, RoleEnum, InspectionResultEnum
from ..schemas import InspectionCreate, InspectionOut, InspectionUpdate

router = APIRouter(prefix="/inspections", tags=["inspections"])

@router.get("", response_model=list[InspectionOut])
@router.get("/", response_model=list[InspectionOut])
def list_inspections(
    db: Session = Depends(get_db),
    current_user: Inspector = Depends(get_current_user)
):
    return list(db.scalars(select(Inspection).order_by(Inspection.id.desc())))

@router.post("", response_model=InspectionOut, status_code=status.HTTP_201_CREATED)
@router.post("/", response_model=InspectionOut, status_code=status.HTTP_201_CREATED)
def create_inspection(
    payload: InspectionCreate,
    db: Session = Depends(get_db),
    current_user: Inspector = Depends(get_current_user)
):
    fac_id = payload.facility_id
    if not db.get(Facility, fac_id):
        fac = db.scalar(select(Facility))
        if not fac:
            fac = Facility(name="Объект №1", address="г. Новосибирск", risk_level=RiskLevelEnum.medium)
            db.add(fac)
            db.commit()
            db.refresh(fac)
        fac_id = fac.id

    insp_id = payload.inspector_id
    if not insp_id or not db.get(Inspector, insp_id):
        first_insp = db.scalar(select(Inspector))
        if not first_insp:
            first_insp = Inspector(full_name="Инспектор", rank="Лейтенант", email="insp@mchs.ru", password_hash="hash", role=RoleEnum.inspector)
            db.add(first_insp)
            db.commit()
            db.refresh(first_insp)
        insp_id = first_insp.id

    # Преобразуем строковый результат в Enum
    res_val = InspectionResultEnum.passed if payload.result == "Пройдена" else InspectionResultEnum.failed

    item = Inspection(
        facility_id=fac_id,
        inspector_id=insp_id,
        date=payload.date,
        result=res_val,
        violations=payload.violations or "",
        prescription_number=payload.prescription_number or ""
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    return item

@router.delete("/{inspection_id}", status_code=status.HTTP_204_NO_CONTENT)
@router.delete("/{inspection_id}/", status_code=status.HTTP_204_NO_CONTENT)
def delete_inspection(inspection_id: int, db: Session = Depends(get_db)):
    item = db.get(Inspection, inspection_id)
    if item:
        db.delete(item)
        db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
