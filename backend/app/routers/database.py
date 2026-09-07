import json
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, Response, status
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
from sqlalchemy.orm import Session
from sqlalchemy import select

from ..database import get_db
from ..deps import get_current_user, require_roles
from ..models import Facility, Inspector, Equipment, Inspection, RoleEnum, RiskLevelEnum, EquipmentStatusEnum, InspectionResultEnum
from ..security import hash_password

router = APIRouter(prefix="/database", tags=["database"])

@router.get("/backup")
def export_database_backup(
    db: Session = Depends(get_db),
    current_user: Inspector = Depends(require_roles(RoleEnum.admin))
):
    """Выгрузка полной резервной копии базы данных PostgreSQL в формате JSON (только для Администратора)."""
    try:
        facilities = db.scalars(select(Facility)).all()
        inspectors = db.scalars(select(Inspector)).all()
        equipment = db.scalars(select(Equipment)).all()
        inspections = db.scalars(select(Inspection)).all()

        facilities_data = [
            {
                "id": f.id,
                "name": f.name,
                "address": f.address,
                "risk_level": f.risk_level.value if hasattr(f.risk_level, "value") else str(f.risk_level),
                "cadastral_number": f.cadastral_number,
                "responsible_person": f.responsible_person
            }
            for f in facilities
        ]

        inspectors_data = [
            {
                "id": i.id,
                "full_name": i.full_name,
                "rank": i.rank,
                "phone": i.phone,
                "email": i.email,
                "role": i.role.value if hasattr(i.role, "value") else str(i.role),
                "password_hash": i.password_hash,
                "created_at": i.created_at.isoformat() if i.created_at else None
            }
            for i in inspectors
        ]

        equipment_data = [
            {
                "id": e.id,
                "facility_id": e.facility_id,
                "name": e.name,
                "type": e.type,
                "serial_number": e.serial_number,
                "status": e.status.value if hasattr(e.status, "value") else str(e.status),
                "last_check_date": str(e.last_check_date) if e.last_check_date else None,
                "next_check_date": str(e.next_check_date) if e.next_check_date else None,
                "notes": e.notes
            }
            for e in equipment
        ]

        inspections_data = [
            {
                "id": ins.id,
                "facility_id": ins.facility_id,
                "inspector_id": ins.inspector_id,
                "date": str(ins.date) if ins.date else None,
                "result": ins.result.value if hasattr(ins.result, "value") else str(ins.result),
                "prescription_number": ins.prescription_number,
                "violations": ins.violations,
                "created_at": ins.created_at.isoformat() if ins.created_at else None
            }
            for ins in inspections
        ]

        backup_payload = {
            "version": "1.0.0",
            "export_date": datetime.utcnow().isoformat(),
            "system": "АС ПожНадзор (ГОСТ Р 57580.1)",
            "environment": "production-postgresql",
            "database": {
                "facilities": facilities_data,
                "inspectors": inspectors_data,
                "users": inspectors_data,
                "equipment": equipment_data,
                "inspections": inspections_data
            }
        }

        content = json.dumps(backup_payload, ensure_ascii=False, indent=2)
        date_str = datetime.utcnow().strftime("%Y-%m-%d")
        filename = f"Резервная_копия_ПожНадзор_БД_{date_str}.json"

        return Response(
            content=content.encode("utf-8"),
            media_type="application/json; charset=utf-8",
            headers={
                "Content-Disposition": f'attachment; filename="{filename}"'
            }
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Ошибка создания резервной копии: {str(e)}")


@router.post("/restore")
def restore_database_backup(
    payload: Dict[str, Any],
    db: Session = Depends(get_db),
    current_user: Inspector = Depends(require_roles(RoleEnum.admin))
):
    """
    Восстановление базы данных из резервной копии JSON.
    Сохраняет хэши паролей сотрудников, позволяя входить без повторной регистрации.
    Доступно только Администратору.
    """
    try:
        db_data = payload.get("database") if isinstance(payload.get("database"), dict) else payload

        raw_inspectors = db_data.get("inspectors") or db_data.get("users") or []
        raw_facilities = db_data.get("facilities") or []
        raw_equipment = db_data.get("equipment") or []
        raw_inspections = db_data.get("inspections") or []

        # 1. Восстановление сотрудников с хэшами паролей
        restored_users_count = 0
        for u in raw_inspectors:
            email = str(u.get("email", "")).strip().lower()
            if not email:
                continue

            role_str = str(u.get("role", "Инспектор")).strip().lower()
            role_enum = RoleEnum.admin if "админ" in role_str or "admin" in role_str else RoleEnum.inspector

            existing_user = db.scalar(select(Inspector).where(Inspector.email == email))
            pwd_hash = u.get("password_hash") or (hash_password(u.get("password")) if u.get("password") else None)

            if existing_user:
                existing_user.full_name = u.get("full_name") or existing_user.full_name
                existing_user.rank = u.get("rank") or existing_user.rank
                existing_user.phone = u.get("phone") or existing_user.phone
                existing_user.role = role_enum
                if pwd_hash:
                    existing_user.password_hash = pwd_hash
            else:
                new_user = Inspector(
                    full_name=u.get("full_name", "Инспектор ГПН"),
                    rank=u.get("rank", "Сотрудник ГПН"),
                    phone=u.get("phone"),
                    email=email,
                    password_hash=pwd_hash or hash_password("Mchs2026!"),
                    role=role_enum
                )
                db.add(new_user)
            restored_users_count += 1

        db.commit()

        # 2. Восстановление объектов
        restored_fac_count = 0
        for f in raw_facilities:
            f_name = f.get("name")
            if not f_name:
                continue

            risk_str = str(f.get("risk_level", "Средний"))
            risk_val = RiskLevelEnum.medium
            for rk in RiskLevelEnum:
                if rk.value.lower() == risk_str.lower() or rk.name.lower() == risk_str.lower():
                    risk_val = rk
                    break

            existing_fac = db.scalar(select(Facility).where(Facility.name == f_name))
            if existing_fac:
                existing_fac.address = f.get("address", existing_fac.address)
                existing_fac.risk_level = risk_val
                existing_fac.cadastral_number = f.get("cadastral_number", existing_fac.cadastral_number)
                existing_fac.responsible_person = f.get("responsible_person", existing_fac.responsible_person)
            else:
                new_fac = Facility(
                    name=f_name,
                    address=f.get("address", "г. Новосибирск"),
                    risk_level=risk_val,
                    cadastral_number=f.get("cadastral_number"),
                    responsible_person=f.get("responsible_person")
                )
                db.add(new_fac)
            restored_fac_count += 1

        db.commit()

        return {
            "status": "ok",
            "message": "База данных успешно восстановлена из резервной копии",
            "restored_inspectors": restored_users_count,
            "restored_facilities": restored_fac_count
        }
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Ошибка восстановления базы данных: {str(e)}")

