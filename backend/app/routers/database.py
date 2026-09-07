import json
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, Response
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session
from sqlalchemy import select

from ..database import get_db
from ..models import Facility, Inspector, Equipment, Inspection, RoleEnum, RiskLevelEnum, EquipmentStatusEnum, InspectionResultEnum

router = APIRouter(prefix="/database", tags=["database"])

@router.get("/backup")
def export_database_backup(db: Session = Depends(get_db)):
    """Выгрузка полной резервной копии базы данных PostgreSQL в формате JSON."""
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
                "role": "Администратор" if (i.role.value if hasattr(i.role, "value") else str(i.role)) == "admin" else "Инспектор"
            }
            for i in inspectors
        ]

        equipment_data = [
            {
                "id": e.id,
                "facility_id": e.facility_id,
                "type": e.type,
                "inventory_number": e.inventory_number,
                "status": e.status.value if hasattr(e.status, "value") else str(e.status),
                "last_check": str(e.last_check) if e.last_check else None,
                "next_check": str(e.next_check) if e.next_check else None
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
                "violations": ins.violations
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
