from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session
from ..database import get_db
from ..deps import get_current_user
from ..models import Facility, Inspector
from ..schemas import FacilityCreate, FacilityOut, FacilityUpdate

router = APIRouter(prefix='/facilities', tags=['facilities'])

@router.get('', response_model=list[FacilityOut])
@router.get('/', response_model=list[FacilityOut])
def list_facilities(
    db: Session = Depends(get_db),
    current_user: Inspector = Depends(get_current_user)
):
    return list(db.scalars(select(Facility).order_by(Facility.id.asc())))

@router.post('', response_model=FacilityOut, status_code=status.HTTP_201_CREATED)
@router.post('/', response_model=FacilityOut, status_code=status.HTTP_201_CREATED)
def create_facility(
    payload: FacilityCreate,
    db: Session = Depends(get_db),
    current_user: Inspector = Depends(get_current_user)
):
    facility = Facility(**payload.model_dump())
    db.add(facility)
    db.commit()
    db.refresh(facility)
    return facility

@router.put('/{facility_id}', response_model=FacilityOut)
def update_facility(
    facility_id: int,
    payload: FacilityUpdate,
    db: Session = Depends(get_db),
    current_user: Inspector = Depends(get_current_user)
):
    item = db.get(Facility, facility_id)
    if not item:
        raise HTTPException(status_code=404, detail='Объект не найден')
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(item, k, v)
    db.commit()
    db.refresh(item)
    return item

@router.delete('/{facility_id}', status_code=status.HTTP_204_NO_CONTENT)
def delete_facility(
    facility_id: int,
    db: Session = Depends(get_db),
    current_user: Inspector = Depends(get_current_user)
):
    item = db.get(Facility, facility_id)
    if item:
        db.delete(item)
        db.commit()

