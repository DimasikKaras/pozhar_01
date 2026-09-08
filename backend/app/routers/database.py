import os
import json
import subprocess
from datetime import datetime, date
from typing import Optional, List, Dict, Any
from urllib.parse import quote, unquote

from fastapi import APIRouter, Depends, HTTPException, Response, Query, status
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import select, delete, update, func

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
from ..utils.crypto import (
    encrypt_data_aes256,
    decrypt_data_aes256,
    is_aes256_encrypted
)

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


def cleanup_all_database_duplicates(db: Session) -> Dict[str, int]:
    """
    Глубокая дедупликация базы данных PostgreSQL:
    1. Схлопывание дубликатов объектов Facility (по нормализованному названию или кадастровому номеру);
    2. Перепривязка оборудования и проверок к первичному объекту;
    3. Схлопывание дубликатов оборудования Equipment (по facility_id, названию, типу и серийному номеру);
    4. Схлопывание дубликатов проверок Inspection (по facility_id, inspector_id, дате и предписанию);
    5. Схлопывание дубликатов инспекторов (по email).
    """
    fac_removed = 0
    eq_removed = 0
    insp_removed = 0
    users_removed = 0

    # 1. Дедупликация Facility
    all_facilities = list(db.scalars(select(Facility).order_by(Facility.id.asc())))
    fac_name_groups: Dict[str, List[Facility]] = {}
    for f in all_facilities:
        key = f.name.strip().lower() if f.name else f"id_{f.id}"
        fac_name_groups.setdefault(key, []).append(f)

    for key, group in fac_name_groups.items():
        if len(group) > 1:
            primary = group[0]
            for dup in group[1:]:
                # Переносим оборудование и проверки на primary
                db.execute(update(Equipment).where(Equipment.facility_id == dup.id).values(facility_id=primary.id))
                db.execute(update(Inspection).where(Inspection.facility_id == dup.id).values(facility_id=primary.id))
                db.delete(dup)
                fac_removed += 1

    db.flush()

    # 2. Дедупликация Equipment
    all_equipment = list(db.scalars(select(Equipment).order_by(Equipment.id.asc())))
    eq_groups: Dict[str, List[Equipment]] = {}
    for e in all_equipment:
        ser = (e.serial_number or "").strip().lower()
        nm = (e.name or "").strip().lower()
        tp = (e.type or "").strip().lower()
        k = f"{e.facility_id}::{nm}::{tp}::{ser}"
        eq_groups.setdefault(k, []).append(e)

    for k, group in eq_groups.items():
        if len(group) > 1:
            # Оставляем первую запись, дубликаты удаляем
            for dup in group[1:]:
                db.delete(dup)
                eq_removed += 1

    db.flush()

    # 3. Дедупликация Inspection
    all_inspections = list(db.scalars(select(Inspection).order_by(Inspection.id.asc())))
    insp_groups: Dict[str, List[Inspection]] = {}
    for ins in all_inspections:
        dt = str(ins.date) if ins.date else ""
        pr = (ins.prescription_number or "").strip().lower()
        k = f"{ins.facility_id}::{ins.inspector_id}::{dt}::{pr}"
        insp_groups.setdefault(k, []).append(ins)

    for k, group in insp_groups.items():
        if len(group) > 1:
            for dup in group[1:]:
                db.delete(dup)
                insp_removed += 1

    db.flush()

    # 4. Дедупликация Inspector по email
    all_inspectors = list(db.scalars(select(Inspector).order_by(Inspector.id.asc())))
    user_groups: Dict[str, List[Inspector]] = {}
    for u in all_inspectors:
        em = u.email.strip().lower() if u.email else ""
        if em:
            user_groups.setdefault(em, []).append(u)

    for em, group in user_groups.items():
        if len(group) > 1:
            primary_user = group[0]
            for dup in group[1:]:
                db.execute(update(Inspection).where(Inspection.inspector_id == dup.id).values(inspector_id=primary_user.id))
                db.delete(dup)
                users_removed += 1

    db.commit()

    return {
        "facilities_removed": fac_removed,
        "equipment_removed": eq_removed,
        "inspections_removed": insp_removed,
        "inspectors_removed": users_removed
    }


def restore_data_from_dict(db_data: Dict[str, Any], db: Session, mode: str = "replace") -> Dict[str, Any]:
    """
    Восстановление данных из словаря с полной защитой от дубликатов
    и сохранением роли 'Старший инспектор' (RoleEnum.senior).
    """
    raw_inspectors = db_data.get("inspectors") or db_data.get("users") or []
    raw_facilities = db_data.get("facilities") or []
    raw_equipment = db_data.get("equipment") or []
    raw_inspections = db_data.get("inspections") or []

    # 1. Восстановление сотрудников с сохранением password_hash и правильных ролей
    restored_users_count = 0
    inspector_id_map = {}
    for u in raw_inspectors:
        email = str(u.get("email", "")).strip().lower()
        if not email:
            continue

        role_str = str(u.get("role", "Инспектор")).strip().lower()
        if "админ" in role_str or "admin" in role_str:
            role_enum = RoleEnum.admin
        elif "старш" in role_str or "senior" in role_str:
            role_enum = RoleEnum.senior
        else:
            role_enum = RoleEnum.inspector

        existing_user = db.scalar(select(Inspector).where(func.lower(func.trim(Inspector.email)) == email))
        pwd_hash = u.get("password_hash") or u.get("hashed_password")
        if not pwd_hash and u.get("password"):
            pwd_hash = hash_password(u.get("password"))

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
                password_hash=pwd_hash or hash_password(u.get("password") or "Mchs2026!"),
                role=role_enum
            )
            db.add(new_user)
            db.flush()
            target_user = new_user

        if u.get("id"):
            inspector_id_map[u["id"]] = target_user.id
        restored_users_count += 1

    db.commit()

    # 2. Восстановление поднадзорных объектов (дедупликация по имени и id)
    restored_fac_count = 0
    facility_id_map = {}
    seen_fac_names = set()

    for f in raw_facilities:
        f_name = str(f.get("name") or "").strip()
        if not f_name:
            continue

        norm_name = f_name.lower()
        risk_val = parse_risk_level(f.get("risk_level"))
        cadastral = str(f.get("cadastral_number") or "").strip() or None

        # Ищем существующий объект: сначала по ID из бэкапа, затем по нормализованному названию
        existing_fac = None
        if f.get("id"):
            existing_fac = db.get(Facility, f["id"])
        if not existing_fac:
            existing_fac = db.scalar(
                select(Facility).where(func.lower(func.trim(Facility.name)) == norm_name)
            )
        if not existing_fac and cadastral:
            existing_fac = db.scalar(
                select(Facility).where(Facility.cadastral_number == cadastral)
            )

        if existing_fac:
            existing_fac.name = f_name
            existing_fac.address = f.get("address", existing_fac.address)
            existing_fac.risk_level = risk_val
            existing_fac.cadastral_number = cadastral or existing_fac.cadastral_number
            existing_fac.responsible_person = f.get("responsible_person", existing_fac.responsible_person)
            target_fac = existing_fac
        else:
            new_fac = Facility(
                name=f_name,
                address=f.get("address", "г. Новосибирск"),
                risk_level=risk_val,
                cadastral_number=cadastral,
                responsible_person=f.get("responsible_person")
            )
            db.add(new_fac)
            db.flush()
            target_fac = new_fac

        if f.get("id"):
            facility_id_map[f["id"]] = target_fac.id
        seen_fac_names.add(norm_name)
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

    fallback_insp = db.scalars(select(Inspector)).first()

    # В РЕЖИМЕ REPLACE (полное восстановление) очищаем старые проверки и оборудование
    if mode == "replace":
        db.execute(delete(Inspection))
        db.execute(delete(Equipment))
        db.commit()

    # 3. Восстановление оборудования и СИЗ (с дедупликацией)
    restored_eq_count = 0
    seen_equipment_keys = set()

    for e in raw_equipment:
        eq_name = str(e.get("name") or e.get("type") or "Оборудование ПБ").strip()
        orig_fac_id = e.get("facility_id")
        mapped_fac_id = facility_id_map.get(orig_fac_id, orig_fac_id)
        if not mapped_fac_id or not db.get(Facility, mapped_fac_id):
            mapped_fac_id = fallback_fac.id if fallback_fac else None

        if not mapped_fac_id:
            continue

        st_val = parse_equipment_status(e.get("status"))
        last_check = parse_date_safe(e.get("last_check_date"))
        next_check = parse_date_safe(e.get("next_check_date")) if e.get("next_check_date") else None
        serial_no = str(e.get("serial_number") or "").strip() or None
        eq_type = str(e.get("type") or "Первичные средства пожаротушения").strip()

        # Дедупликационный ключ
        eq_key = f"{mapped_fac_id}::{eq_name.lower()}::{eq_type.lower()}::{str(serial_no).lower()}"
        if eq_key in seen_equipment_keys:
            continue
        seen_equipment_keys.add(eq_key)

        existing_eq = None
        if serial_no:
            existing_eq = db.scalar(
                select(Equipment).where(
                    Equipment.facility_id == mapped_fac_id,
                    Equipment.serial_number == serial_no
                )
            )
        if not existing_eq:
            existing_eq = db.scalar(
                select(Equipment).where(
                    Equipment.facility_id == mapped_fac_id,
                    func.lower(func.trim(Equipment.name)) == eq_name.lower(),
                    func.lower(func.trim(Equipment.type)) == eq_type.lower()
                )
            )

        if existing_eq:
            existing_eq.status = st_val
            existing_eq.last_check_date = last_check
            existing_eq.next_check_date = next_check
            existing_eq.notes = e.get("notes", existing_eq.notes)
        else:
            new_eq = Equipment(
                facility_id=mapped_fac_id,
                name=eq_name,
                type=eq_type,
                serial_number=serial_no,
                status=st_val,
                last_check_date=last_check,
                next_check_date=next_check,
                notes=e.get("notes")
            )
            db.add(new_eq)

        restored_eq_count += 1

    db.commit()

    # 4. Восстановление проверок (с дедупликацией)
    restored_insp_count = 0
    seen_inspection_keys = set()

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
        prescr = str(ins.get("prescription_number") or "").strip() or None

        insp_key = f"{mapped_fac_id}::{mapped_insp_id}::{str(insp_date)}::{str(prescr).lower()}"
        if insp_key in seen_inspection_keys:
            continue
        seen_inspection_keys.add(insp_key)

        existing_insp = None
        if prescr:
            existing_insp = db.scalar(
                select(Inspection).where(Inspection.prescription_number == prescr)
            )
        if not existing_insp:
            existing_insp = db.scalar(
                select(Inspection).where(
                    Inspection.facility_id == mapped_fac_id,
                    Inspection.inspector_id == mapped_insp_id,
                    Inspection.date == insp_date
                )
            )

        if existing_insp:
            existing_insp.result = res_val
            existing_insp.violations = ins.get("violations", existing_insp.violations)
            existing_insp.prescription_number = prescr or existing_insp.prescription_number
        else:
            new_insp = Inspection(
                facility_id=mapped_fac_id,
                inspector_id=mapped_insp_id,
                date=insp_date,
                result=res_val,
                prescription_number=prescr,
                violations=ins.get("violations")
            )
            db.add(new_insp)

        restored_insp_count += 1

    db.commit()

    # Финальная чистка всех накопившихся дубликатов
    cleanup_stats = cleanup_all_database_duplicates(db)

    return {
        "status": "ok",
        "message": "База данных успешно восстановлена без дубликатов",
        "mode": mode,
        "restored_inspectors": restored_users_count,
        "restored_facilities": restored_fac_count,
        "restored_equipment": restored_eq_count,
        "restored_inspections": restored_insp_count,
        "deduplicated": cleanup_stats
    }


@router.post("/cleanup-duplicates")
def cleanup_database_duplicates_endpoint(
    db: Session = Depends(get_db),
    current_user: Inspector = Depends(require_roles(RoleEnum.admin, RoleEnum.senior))
):
    """Принудительная очистка всех дубликатов в базе данных PostgreSQL."""
    try:
        stats = cleanup_all_database_duplicates(db)
        return {
            "status": "ok",
            "message": "База данных успешно очищена от дубликатов",
            "removed": stats
        }
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Ошибка очистки дубликатов: {str(e)}")


# ==============================================================================
# ЭНДПОИНТЫ ДЛЯ РАБОТЫ С БЭКАПАМИ (ПК АДМИНИСТРАТОРА И DOCKER НА СЕРВЕРЕ)
# ==============================================================================

@router.get("/backup")
def export_database_backup(
    encrypt: bool = Query(False, description="Зашифровать бэкап алгоритмом AES-256"),
    passphrase: Optional[str] = Query(None, description="Пароль шифрования AES-256"),
    db: Session = Depends(get_db),
    current_user: Inspector = Depends(require_roles(RoleEnum.admin))
):
    """Скачивание полной резервной копии базы данных на ПК администратора (с поддержкой AES-256)."""
    try:
        backup_payload = build_full_backup_dict(db)
        date_str = datetime.utcnow().strftime("%Y-%m-%d_%H-%M-%S")

        if encrypt:
            if not passphrase or len(passphrase.strip()) < 4:
                raise HTTPException(status_code=400, detail="Для шифрования AES-256 укажите пароль длиной не менее 4 символов")
            raw_bytes = json.dumps(backup_payload, ensure_ascii=False, indent=2).encode("utf-8")
            encrypted_payload = encrypt_data_aes256(raw_bytes, passphrase.strip())
            content = json.dumps(encrypted_payload, ensure_ascii=False, indent=2).encode("utf-8")
            filename = f"pozhnadzor_backup_{date_str}.enc.json"
        else:
            content = json.dumps(backup_payload, ensure_ascii=False, indent=2).encode("utf-8")
            filename = f"pozhnadzor_backup_{date_str}.json"

        safe_ascii_name = filename.encode("ascii", "ignore").decode("ascii") or "backup.json"
        return Response(
            content=content,
            media_type="application/json; charset=utf-8",
            headers={
                "Content-Disposition": f'attachment; filename="{safe_ascii_name}"; filename*=UTF-8\'\'{quote(filename)}',
                "Access-Control-Expose-Headers": "Content-Disposition"
            }
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Ошибка создания резервной копии: {str(e)}")


class CreateServerBackupRequest(BaseModel):
    custom_name: Optional[str] = None
    client_data: Optional[Dict[str, Any]] = None
    encrypt: Optional[bool] = False
    passphrase: Optional[str] = None


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
        safe_name = ""
        if custom_name:
            safe_name = "".join(c for c in custom_name if c.isalnum() or c in ("-", "_", " ")).strip().replace(" ", "_")

        is_enc = bool(payload and payload.encrypt and payload.passphrase and payload.passphrase.strip())
        ext = ".enc.json" if is_enc else ".json"

        if safe_name:
            filename = f"pozhnadzor_backup_{safe_name}_{timestamp}{ext}"
        else:
            filename = f"pozhnadzor_backup_{timestamp}{ext}"

        filepath = os.path.join(BACKUP_DIR, filename)

        # Выгрузка данных
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

            # ОБЯЗАТЕЛЬНО дополняем сотрудников реальными password_hash из базы данных PostgreSQL!
            target_db_data = backup_data.get("database") if isinstance(backup_data.get("database"), dict) else backup_data
            raw_users = target_db_data.get("inspectors") or target_db_data.get("users") or []
            if raw_users:
                db_users_map = {u.email.lower(): u.password_hash for u in db.scalars(select(Inspector)).all()}
                for u in raw_users:
                    em = str(u.get("email", "")).strip().lower()
                    if em in db_users_map and not u.get("password_hash"):
                        u["password_hash"] = db_users_map[em]
        else:
            backup_data = build_full_backup_dict(db)

        # Шифрование AES-256 при наличии запроса
        if is_enc:
            raw_bytes = json.dumps(backup_data, ensure_ascii=False, indent=2).encode("utf-8")
            enc_dict = encrypt_data_aes256(raw_bytes, payload.passphrase.strip())
            file_content = json.dumps(enc_dict, ensure_ascii=False, indent=2)
        else:
            file_content = json.dumps(backup_data, ensure_ascii=False, indent=2)

        with open(filepath, "w", encoding="utf-8") as f:
            f.write(file_content)

        size_bytes = os.path.getsize(filepath)

        return {
            "status": "ok",
            "message": "Резервная копия успешно сохранена в хранилище Docker на сервере",
            "filename": filename,
            "filepath": filepath,
            "encrypted": is_enc,
            "algorithm": "AES-256-GCM" if is_enc else None,
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
            if not (lower_fn.endswith(".json") or lower_fn.endswith(".sql.gz") or lower_fn.endswith(".dump") or lower_fn.endswith(".enc")):
                continue

            stat = os.stat(full_path)
            size_bytes = stat.st_size
            created_dt = datetime.fromtimestamp(stat.st_mtime)

            b_type = "json"
            if lower_fn.endswith(".sql.gz") or lower_fn.endswith(".dump"):
                b_type = "sql"

            # Проверка, зашифрован ли файл
            is_encrypted = lower_fn.endswith(".enc.json") or lower_fn.endswith(".enc")
            algo = "AES-256-GCM" if is_encrypted else None

            if not is_encrypted and lower_fn.endswith(".json") and size_bytes < 50000:
                try:
                    with open(full_path, "r", encoding="utf-8") as tf:
                        snippet = json.load(tf)
                        if is_aes256_encrypted(snippet):
                            is_encrypted = True
                            algo = snippet.get("algorithm", "AES-256-GCM")
                except Exception:
                    pass

            items.append({
                "filename": fn,
                "size_bytes": size_bytes,
                "size_formatted": format_file_size(size_bytes),
                "created_at": created_dt.strftime("%Y-%m-%d %H:%M:%S"),
                "timestamp": stat.st_mtime,
                "type": b_type,
                "encrypted": is_encrypted,
                "algorithm": algo
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


class ServerRestoreRequest(BaseModel):
    passphrase: Optional[str] = None
    mode: Optional[str] = "replace"


@router.post("/server-restore/{filename}")
def restore_from_server_backup(
    filename: str,
    payload_body: Optional[ServerRestoreRequest] = None,
    db: Session = Depends(get_db),
    current_user: Inspector = Depends(require_roles(RoleEnum.admin))
):
    """Восстановление базы данных из резервной копии, хранящейся в Docker на сервере."""
    safe_filename = os.path.basename(unquote(filename))
    filepath = os.path.join(BACKUP_DIR, safe_filename)

    if not os.path.isfile(filepath):
        raise HTTPException(status_code=404, detail=f"Файл бэкапа '{safe_filename}' не найден в хранилище Docker")

    mode = (payload_body.mode if payload_body and payload_body.mode else "replace").lower()

    try:
        lower_name = safe_filename.lower()
        if lower_name.endswith(".json") or lower_name.endswith(".enc"):
            with open(filepath, "r", encoding="utf-8") as f:
                payload = json.load(f)

            # Если бэкап зашифрован AES-256
            if is_aes256_encrypted(payload):
                passphrase = (payload_body.passphrase if payload_body else None)
                if not passphrase:
                    raise HTTPException(
                        status_code=400,
                        detail="Резервная копия зашифрована алгоритмом AES-256. Введите пароль для расшифрования."
                    )
                try:
                    decrypted_bytes = decrypt_data_aes256(payload, passphrase.strip())
                    payload = json.loads(decrypted_bytes.decode("utf-8"))
                except ValueError as ve:
                    raise HTTPException(status_code=400, detail=str(ve))

            db_data = payload.get("database") if isinstance(payload.get("database"), dict) else payload
            res = restore_data_from_dict(db_data, db, mode=mode)
            res["source_file"] = safe_filename
            return res

        elif lower_name.endswith(".sql.gz"):
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
    except HTTPException:
        db.rollback()
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Ошибка восстановления из файла '{safe_filename}': {str(e)}")


def _send_backup_file_response(safe_filename: str) -> Response:
    filepath = os.path.join(BACKUP_DIR, safe_filename)
    if not os.path.isfile(filepath):
        raise HTTPException(status_code=404, detail="Файл бэкапа не найден в хранилище Docker")

    with open(filepath, "rb") as f:
        data = f.read()

    lower_name = safe_filename.lower()
    if lower_name.endswith(".json"):
        media_type = "application/json; charset=utf-8"
    elif lower_name.endswith(".sql.gz"):
        media_type = "application/gzip"
    else:
        media_type = "application/octet-stream"

    safe_ascii_name = safe_filename.encode("ascii", "ignore").decode("ascii") or "backup_download.json"
    headers = {
        "Content-Disposition": f'attachment; filename="{safe_ascii_name}"; filename*=UTF-8\'\'{quote(safe_filename)}',
        "Access-Control-Expose-Headers": "Content-Disposition",
        "Content-Length": str(len(data))
    }
    return Response(content=data, media_type=media_type, headers=headers)


@router.get("/server-backups/download")
def download_server_backup_query(
    filename: str = Query(..., description="Имя файла бэкапа для скачивания"),
    current_user: Inspector = Depends(require_roles(RoleEnum.admin))
):
    """Скачивание файла бэкапа из Docker на ПК администратора через Query-параметр (наиболее надежно)."""
    safe_filename = os.path.basename(unquote(filename).strip())
    return _send_backup_file_response(safe_filename)


@router.get("/server-backups/{filename}/download")
def download_server_backup(
    filename: str,
    current_user: Inspector = Depends(require_roles(RoleEnum.admin))
):
    """Скачивание файла бэкапа из Docker на ПК администратора через Path-параметр."""
    safe_filename = os.path.basename(unquote(filename).strip())
    return _send_backup_file_response(safe_filename)


@router.delete("/server-backups/{filename}")
def delete_server_backup(
    filename: str,
    current_user: Inspector = Depends(require_roles(RoleEnum.admin))
):
    """Удаление файла резервной копии из хранилища Docker на сервере."""
    safe_filename = os.path.basename(unquote(filename).strip())
    filepath = os.path.join(BACKUP_DIR, safe_filename)

    if not os.path.isfile(filepath):
        raise HTTPException(status_code=404, detail="Файл бэкапа не найден")

    try:
        os.remove(filepath)
        return {"status": "ok", "message": f"Файл '{safe_filename}' успешно удален из хранилища Docker"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Не удалось удалить файл: {str(e)}")


class RestorePayload(BaseModel):
    database: Optional[Dict[str, Any]] = None
    passphrase: Optional[str] = None
    mode: Optional[str] = "replace"

    class Config:
        extra = "allow"


@router.post("/restore")
def restore_database_backup(
    payload: Dict[str, Any],
    db: Session = Depends(get_db),
    current_user: Inspector = Depends(require_roles(RoleEnum.admin))
):
    """Восстановление базы данных из переданного JSON (с ПК администратора, с поддержкой AES-256)."""
    try:
        mode = str(payload.get("mode", "replace")).lower()

        # Проверка на шифрование AES-256
        if is_aes256_encrypted(payload):
            passphrase = payload.get("passphrase")
            if not passphrase:
                raise HTTPException(
                    status_code=400,
                    detail="Файл бэкапа зашифрован алгоритмом AES-256. Введите пароль для расшифрования."
                )
            try:
                decrypted_bytes = decrypt_data_aes256(payload, str(passphrase).strip())
                payload = json.loads(decrypted_bytes.decode("utf-8"))
            except ValueError as ve:
                raise HTTPException(status_code=400, detail=str(ve))

        db_data = payload.get("database") if isinstance(payload.get("database"), dict) else payload
        return restore_data_from_dict(db_data, db, mode=mode)
    except HTTPException:
        db.rollback()
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Ошибка восстановления базы данных: {str(e)}")
