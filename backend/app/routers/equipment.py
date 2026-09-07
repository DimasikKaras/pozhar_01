from fastapi import APIRouter, Depends, HTTPException, status, Response
from sqlalchemy import select
from sqlalchemy.orm import Session
from datetime import date, datetime
from ..database import get_db
from ..deps import get_current_user
from ..models import Equipment, Facility, Inspector, EquipmentStatusEnum, RiskLevelEnum
from ..schemas import EquipmentCreate, EquipmentOut, EquipmentUpdate

router = APIRouter(prefix="/equipment", tags=["equipment"])

def serialize_equipment(item: Equipment) -> dict:
    st = item.status
    if hasattr(st, "value"):
        st = st.value
    elif isinstance(st, str):
        st = st
    else:
        st = "Исправен"

    chk_date = item.last_check_date
    if isinstance(chk_date, (date, datetime)):
        chk_date = chk_date.strftime("%Y-%m-%d")

    return {
        "id": item.id,
        "facility_id": item.facility_id,
        "name": item.name or item.type or "Оборудование",
        "type": item.type or "Оборудование",
        "serial_number": item.serial_number or "",
        "status": st,
        "last_check_date": chk_date or str(date.today()),
        "next_check_date": str(item.next_check_date) if item.next_check_date else None,
        "notes": item.notes or ""
    }

@router.get("")
@router.get("/")
def list_equipment(
    db: Session = Depends(get_db),
    current_user: Inspector = Depends(get_current_user)
):
    items = list(db.scalars(select(Equipment).order_by(Equipment.id.desc())))
    return [serialize_equipment(i) for i in items]

@router.post("", status_code=status.HTTP_201_CREATED)
@router.post("/", status_code=status.HTTP_201_CREATED)
def create_equipment(
    payload: EquipmentCreate,
    db: Session = Depends(get_db),
    current_user: Inspector = Depends(get_current_user)
):
    # 1. Привязываем существующий объект
    fac_id = payload.facility_id
    facility = db.get(Facility, fac_id) if fac_id else None
    if not facility:
        facility = db.scalar(select(Facility))
        if not facility:
            facility = Facility(
                name="Поднадзорный объект №1",
                address="г. Новосибирск",
                risk_level=RiskLevelEnum.medium
            )
            db.add(facility)
            db.commit()
            db.refresh(facility)
        fac_id = facility.id

    # 2. Определяем статус для Enum в PostgreSQL
    status_str = str(payload.status or "Исправен")
    enum_val = EquipmentStatusEnum.active
    for e in EquipmentStatusEnum:
        if e.value == status_str or e.name == status_str:
            enum_val = e
            break

    # 3. Парсим дату
    parsed_date = date.today()
    if payload.last_check_date:
        if isinstance(payload.last_check_date, str):
            try:
                parsed_date = datetime.strptime(payload.last_check_date[:10], "%Y-%m-%d").date()
            except Exception:
                parsed_date = date.today()
        elif isinstance(payload.last_check_date, date):
            parsed_date = payload.last_check_date

    eq_name = payload.name or payload.type or "Оборудование"

    item = Equipment(
        facility_id=fac_id,
        name=eq_name,
        type=payload.type or eq_name,
        serial_number=payload.serial_number or "",
        status=enum_val,
        last_check_date=parsed_date,
        notes=payload.notes or ""
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    return serialize_equipment(item)

@router.put("/{equipment_id}")
@router.put("/{equipment_id}/")
def update_equipment(equipment_id: int, payload: EquipmentUpdate, db: Session = Depends(get_db)):
    item = db.get(Equipment, equipment_id)
    if not item:
        raise HTTPException(status_code=404, detail="Оборудование не найдено")

    if payload.facility_id:
        item.facility_id = payload.facility_id
    if payload.type:
        item.type = payload.type
        item.name = payload.type
    if payload.serial_number is not None:
        item.serial_number = payload.serial_number
    if payload.status:
        for e in EquipmentStatusEnum:
            if e.value == payload.status or e.name == payload.status:
                item.status = e
                break
    if payload.last_check_date:
        if isinstance(payload.last_check_date, str):
            try:
                item.last_check_date = datetime.strptime(payload.last_check_date[:10], "%Y-%m-%d").date()
            except Exception:
                pass
        elif isinstance(payload.last_check_date, date):
            item.last_check_date = payload.last_check_date
    if payload.notes is not None:
        item.notes = payload.notes

    db.commit()
    db.refresh(item)
    return serialize_equipment(item)

@router.delete("/{equipment_id}", status_code=status.HTTP_204_NO_CONTENT)
@router.delete("/{equipment_id}/", status_code=status.HTTP_204_NO_CONTENT)
def delete_equipment(equipment_id: int, db: Session = Depends(get_db)):
    item = db.get(Equipment, equipment_id)
    if item:
        db.delete(item)
        db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
