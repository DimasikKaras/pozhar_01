import os
import json
import subprocess
from datetime import datetime, date
from typing import Optional, List, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, Response, status
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import select

from ..database import get_db
from ..deps import get_current_user, require_roles
from ..models import (
    Facility,
    Inspector,
    Equipment,
    Inspection,
    RoleEnum,
    RiskLevelEnum,
    EquipmentStatusEnum,
    InspectionResultEnum
)
from ..security import hash_password

router = APIRouter(prefix="/database", tags=["database"])

BACKUP_DIR = os.getenv("BACKUP_DIR", "/backups")
os.makedirs(BACKUP_DIR, exist_ok=True)


def format_file_size(size_bytes: int) -> str:
    if size_bytes < 1024:
        return f"{size_bytes} Б"
    elif size_bytes < 1024 * 1024:
        return f"{size_bytes / 1024:.1f} КБ"
    else:
        return f"{size_bytes / (1024 * 1024):.2f} МБ"


def parse_date_safe(val: Any) -> date:
    """Безопасный парсинг даты из JSON с поддержкой различных форматов."""
    if not val:
        return date.today()
    if isinstance(val, date) and not isinstance(val, datetime):
        return val
    if isinstance(val, datetime):
        return val.date()
    val_str = str(val).strip()
    for fmt in ("%Y-%m-%d", "%d.%m.%Y", "%Y/%m/%d"):
        try:
            return datetime.strptime(val_str.split("T")[0], fmt).date()
        except Exception:
            pass
    return date.today()


def parse_equipment_status(st_str: Any) -> EquipmentStatusEnum:
    """Безопасное преобразование статуса оборудования из JSON в EquipmentStatusEnum."""
    if not st_str:
        return EquipmentStatusEnum.active
    s = str(st_str).strip().lower()
    if s in ("active", "operational", "исправен", "в работе", "работает"):
        return EquipmentStatusEnum.active
    if s in ("repair", "maintenance", "требует ремонта", "в ремонте", "ремонт"):
        return EquipmentStatusEnum.repair
    if s in ("written_off", "списан", "списано", "утилизирован"):
        return EquipmentStatusEnum.written_off
    if s in ("inspecting", "inspection", "на проверке", "проверка"):
        return EquipmentStatusEnum.inspecting
    for st in EquipmentStatusEnum:
        if st.value.lower() == s or st.name.lower() == s:
            return st
    return EquipmentStatusEnum.active


def parse_risk_level(risk_str: Any) -> RiskLevelEnum:
    """Безопасное преобразование категории риска из JSON в RiskLevelEnum."""
    if not risk_str:
        return RiskLevelEnum.medium
    s = str(risk_str).strip().lower()
    if "высок" in s or "high" in s:
        return RiskLevelEnum.high
    if "значит" in s or "significant" in s:
        return RiskLevelEnum.significant
    if "средн" in s or "medium" in s:
        return RiskLevelEnum.medium
    if "умерен" in s or "moderate" in s:
        return RiskLevelEnum.moderate
    if "низк" in s or "low" in s:
        return RiskLevelEnum.low
    for r in RiskLevelEnum:
        if r.value.lower() == s or r.name.lower() == s:
            return r
    return RiskLevelEnum.medium


def parse_inspection_result(res_str: Any) -> InspectionResultEnum:
    """Безопасное преобразование результата проверки из JSON в InspectionResultEnum."""
    if not res_str:
        return InspectionResultEnum.passed
    s = str(res_str).strip().lower()
    if "не пройд" in s or "failed" in s or "нарушен" in s:
        return InspectionResultEnum.failed
    return InspectionResultEnum.passed


def build_full_backup_dict(db: Session) -> Dict[str, Any]:
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

    return {
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


def restore_data_from_dict(db_data: Dict[str, Any], db: Session) -> Dict[str, Any]:
    raw_inspectors = db_data.get("inspectors") or db_data.get("users") or []
    raw_facilities = db_data.get("facilities") or []
    raw_equipment = db_data.get("equipment") or []
    raw_inspections = db_data.get("inspections") or []

    # 1. Восстановление сотрудников с хэшами паролей
    restored_users_count = 0
    inspector_id_map = {}
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
            target_user = existing_user
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
            db.flush()
            target_user = new_user

        if u.get("id"):
            inspector_id_map[u["id"]] = target_user.id
        restored_users_count += 1

    db.commit()

    # 2. Восстановление поднадзорных объектов
    restored_fac_count = 0
    facility_id_map = {}
    for f in raw_facilities:
        f_name = f.get("name")
        if not f_name:
            continue

        risk_val = parse_risk_level(f.get("risk_level"))

        existing_fac = db.scalar(select(Facility).where(Facility.name == f_name))
        if existing_fac:
            existing_fac.address = f.get("address", existing_fac.address)
            existing_fac.risk_level = risk_val
            existing_fac.cadastral_number = f.get("cadastral_number", existing_fac.cadastral_number)
            existing_fac.responsible_person = f.get("responsible_person", existing_fac.responsible_person)
            target_fac = existing_fac
        else:
            new_fac = Facility(
                name=f_name,
                address=f.get("address", "г. Новосибирск"),
                risk_level=risk_val,
                cadastral_number=f.get("cadastral_number"),
                responsible_person=f.get("responsible_person")
            )
            db.add(new_fac)
            db.flush()
            target_fac = new_fac

        if f.get("id"):
            facility_id_map[f["id"]] = target_fac.id
        restored_fac_count += 1

    db.commit()

    # Опорный объект на случай, если у оборудования нет объекта
    fallback_fac = db.scalars(select(Facility)).first()
    if not fallback_fac and raw_equipment:
        fallback_fac = Facility(
            name="Главный объект инфраструктуры",
            address="г. Новосибирск",
            risk_level=RiskLevelEnum.medium
        )
        db.add(fallback_fac)
        db.commit()
        db.refresh(fallback_fac)

    # 3. Восстановление оборудования и СИЗ
    restored_eq_count = 0
    for e in raw_equipment:
        eq_name = e.get("name") or e.get("type") or "Оборудование ПБ"

        orig_fac_id = e.get("facility_id")
        mapped_fac_id = facility_id_map.get(orig_fac_id, orig_fac_id)
        if not mapped_fac_id or not db.get(Facility, mapped_fac_id):
            mapped_fac_id = fallback_fac.id if fallback_fac else None

        if not mapped_fac_id:
            continue

        st_val = parse_equipment_status(e.get("status"))
        last_check = parse_date_safe(e.get("last_check_date"))
        next_check = parse_date_safe(e.get("next_check_date")) if e.get("next_check_date") else None

        new_eq = Equipment(
            facility_id=mapped_fac_id,
            name=eq_name,
            type=e.get("type", "Первичные средства пожаротушения"),
            serial_number=e.get("serial_number"),
            status=st_val,
            last_check_date=last_check,
            next_check_date=next_check,
            notes=e.get("notes")
        )
        db.add(new_eq)
        restored_eq_count += 1

    db.commit()

    # Опорный инспектор на случай несовпадения ID
    fallback_insp = db.scalars(select(Inspector)).first()

    # 4. Восстановление проверок
    restored_insp_count = 0
    for ins in raw_inspections:
        orig_fac_id = ins.get("facility_id")
        orig_insp_id = ins.get("inspector_id")
        mapped_fac_id = facility_id_map.get(orig_fac_id, orig_fac_id)
        mapped_insp_id = inspector_id_map.get(orig_insp_id, orig_insp_id)

        if not mapped_fac_id or not db.get(Facility, mapped_fac_id):
            mapped_fac_id = fallback_fac.id if fallback_fac else None

        if not mapped_fac_id:
            continue

        if not mapped_insp_id or not db.get(Inspector, mapped_insp_id):
            mapped_insp_id = fallback_insp.id if fallback_insp else None

        if not mapped_insp_id:
            continue

        res_val = parse_inspection_result(ins.get("result"))
        insp_date = parse_date_safe(ins.get("date"))

        new_insp = Inspection(
            facility_id=mapped_fac_id,
            inspector_id=mapped_insp_id,
            date=insp_date,
            result=res_val,
            prescription_number=ins.get("prescription_number"),
            violations=ins.get("violations")
        )
        db.add(new_insp)
        restored_insp_count += 1

    db.commit()

    return {
        "status": "ok",
        "message": "База данных успешно восстановлена",
        "restored_inspectors": restored_users_count,
        "restored_facilities": restored_fac_count,
        "restored_equipment": restored_eq_count,
        "restored_inspections": restored_insp_count
    }


# ==============================================================================
# ЭНДПОИНТЫ ДЛЯ РАБОТЫ С БЭКАПАМИ (ПК АДМИНИСТРАТОРА И DOCKER НА СЕРВЕРЕ)
# ==============================================================================

@router.get("/backup")
def export_database_backup(
    db: Session = Depends(get_db),
    current_user: Inspector = Depends(require_roles(RoleEnum.admin))
):
    """Скачивание полной резервной копии базы данных на ПК администратора в формате JSON."""
    try:
        backup_payload = build_full_backup_dict(db)
        content = json.dumps(backup_payload, ensure_ascii=False, indent=2)
        date_str = datetime.utcnow().strftime("%Y-%m-%d_%H-%M-%S")
        filename = f"pozhnadzor_backup_{date_str}.json"

        return Response(
            content=content.encode("utf-8"),
            media_type="application/json; charset=utf-8",
            headers={
                "Content-Disposition": f'attachment; filename="{filename}"'
            }
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Ошибка создания резервной копии: {str(e)}")


class CreateServerBackupRequest(BaseModel):
    custom_name: Optional[str] = None
    client_data: Optional[Dict[str, Any]] = None


@router.post("/create-server-backup")
def create_server_backup(
    payload: Optional[CreateServerBackupRequest] = None,
    db: Session = Depends(get_db),
    current_user: Inspector = Depends(require_roles(RoleEnum.admin))
):
    """Создание резервной копии и сохранение в хранилище Docker на сервере (/backups)."""
    try:
        os.makedirs(BACKUP_DIR, exist_ok=True)
        timestamp = datetime.utcnow().strftime("%Y-%m-%d_%H-%M-%S")
        
        custom_name = payload.custom_name.strip() if payload and payload.custom_name else None
        if custom_name:
            # Очищаем имя от недопустимых символов
            safe_name = "".join(c for c in custom_name if c.isalnum() or c in ("-", "_", " ")).strip().replace(" ", "_")
            filename = f"pozhnadzor_backup_{safe_name}_{timestamp}.json"
        else:
            filename = f"pozhnadzor_backup_{timestamp}.json"

        filepath = os.path.join(BACKUP_DIR, filename)

        # Если фронтенд передал актуальные локальные данные, используем их, иначе выгружаем из БД
        if payload and payload.client_data:
            backup_data = payload.client_data
            if "database" not in backup_data and ("facilities" in backup_data or "inspectors" in backup_data):
                backup_data = {
                    "version": "1.0.0",
                    "export_date": datetime.utcnow().isoformat(),
                    "system": "АС ПожНадзор (ГОСТ Р 57580.1)",
                    "environment": "production-postgresql",
                    "database": payload.client_data
                }
        else:
            backup_data = build_full_backup_dict(db)

        content = json.dumps(backup_data, ensure_ascii=False, indent=2)
        with open(filepath, "w", encoding="utf-8") as f:
            f.write(content)

        size_bytes = os.path.getsize(filepath)

        return {
            "status": "ok",
            "message": "Резервная копия успешно сохранена в хранилище Docker на сервере",
            "filename": filename,
            "filepath": filepath,
            "size_bytes": size_bytes,
            "size_formatted": format_file_size(size_bytes),
            "created_at": datetime.utcnow().isoformat()
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Ошибка сохранения бэкапа в Docker: {str(e)}")


@router.get("/server-backups")
def get_server_backups_list(
    current_user: Inspector = Depends(require_roles(RoleEnum.admin))
):
    """Получение списка резервных копий, хранящихся в Docker на сервере."""
    try:
        os.makedirs(BACKUP_DIR, exist_ok=True)
        items = []

        for fn in os.listdir(BACKUP_DIR):
            full_path = os.path.join(BACKUP_DIR, fn)
            if not os.path.isfile(full_path):
                continue

            lower_fn = fn.lower()
            if not (lower_fn.endswith(".json") or lower_fn.endswith(".sql.gz") or lower_fn.endswith(".dump")):
                continue

            stat = os.stat(full_path)
            size_bytes = stat.st_size
            created_dt = datetime.fromtimestamp(stat.st_mtime)

            b_type = "json"
            if lower_fn.endswith(".sql.gz") or lower_fn.endswith(".dump"):
                b_type = "sql"

            items.append({
                "filename": fn,
                "size_bytes": size_bytes,
                "size_formatted": format_file_size(size_bytes),
                "created_at": created_dt.strftime("%Y-%m-%d %H:%M:%S"),
                "timestamp": stat.st_mtime,
                "type": b_type
            })

        # Сортируем: самые свежие сверху
        items.sort(key=lambda x: x["timestamp"], reverse=True)

        return {
            "status": "ok",
            "backup_dir": BACKUP_DIR,
            "total_count": len(items),
            "backups": items
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Ошибка чтения списка бэкапов с сервера: {str(e)}")


@router.post("/server-restore/{filename}")
def restore_from_server_backup(
    filename: str,
    db: Session = Depends(get_db),
    current_user: Inspector = Depends(require_roles(RoleEnum.admin))
):
    """Восстановление базы данных из резервной копии, хранящейся в Docker на сервере."""
    safe_filename = os.path.basename(filename)
    filepath = os.path.join(BACKUP_DIR, safe_filename)

    if not os.path.isfile(filepath):
        raise HTTPException(status_code=404, detail=f"Файл бэкапа '{safe_filename}' не найден в хранилище Docker")

    try:
        if safe_filename.lower().endswith(".json"):
            with open(filepath, "r", encoding="utf-8") as f:
                payload = json.load(f)

            db_data = payload.get("database") if isinstance(payload.get("database"), dict) else payload
            res = restore_data_from_dict(db_data, db)
            res["source_file"] = safe_filename
            return res

        elif safe_filename.lower().endswith(".sql.gz"):
            # Если это SQL дамп из pg_dump, запускаем восстановление через psql/gunzip
            cmd = f"gunzip -c '{filepath}' | psql -h db -U postgres -d pozhnadzor"
            env = os.environ.copy()
            env["PGPASSWORD"] = os.getenv("POSTGRES_PASSWORD", "postgres_secure_pass_2026")
            proc = subprocess.run(cmd, shell=True, env=env, capture_output=True, text=True)
            if proc.returncode != 0:
                raise Exception(f"Ошибка выполнения SQL дампа: {proc.stderr}")
            return {
                "status": "ok",
                "message": f"База данных успешно восстановлена из SQL-дампа {safe_filename}"
            }
        else:
            raise HTTPException(status_code=400, detail="Неподдерживаемый формат файла бэкапа")
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Ошибка восстановления из файла '{safe_filename}': {str(e)}")


@router.get("/server-backups/{filename}/download")
def download_server_backup(
    filename: str,
    current_user: Inspector = Depends(require_roles(RoleEnum.admin))
):
    """Скачивание файла бэкапа из Docker на сервере на ПК администратора."""
    safe_filename = os.path.basename(filename)
    filepath = os.path.join(BACKUP_DIR, safe_filename)

    if not os.path.isfile(filepath):
        raise HTTPException(status_code=404, detail="Файл бэкапа не найден")

    with open(filepath, "rb") as f:
        data = f.read()

    media_type = "application/json" if safe_filename.endswith(".json") else "application/gzip"
    return Response(
        content=data,
        media_type=media_type,
        headers={
            "Content-Disposition": f'attachment; filename="{safe_filename}"'
        }
    )


@router.delete("/server-backups/{filename}")
def delete_server_backup(
    filename: str,
    current_user: Inspector = Depends(require_roles(RoleEnum.admin))
):
    """Удаление файла резервной копии из хранилища Docker на сервере."""
    safe_filename = os.path.basename(filename)
    filepath = os.path.join(BACKUP_DIR, safe_filename)

    if not os.path.isfile(filepath):
        raise HTTPException(status_code=404, detail="Файл бэкапа не найден")

    try:
        os.remove(filepath)
        return {"status": "ok", "message": f"Файл '{safe_filename}' успешно удален из хранилища Docker"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Не удалось удалить файл: {str(e)}")


@router.post("/restore")
def restore_database_backup(
    payload: Dict[str, Any],
    db: Session = Depends(get_db),
    current_user: Inspector = Depends(require_roles(RoleEnum.admin))
):
    """Восстановление базы данных из переданного JSON (с ПК администратора)."""
    try:
        db_data = payload.get("database") if isinstance(payload.get("database"), dict) else payload
        return restore_data_from_dict(db_data, db)
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Ошибка восстановления базы данных: {str(e)}")
