import logging
from datetime import date
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import select
from .config import settings
from .database import Base, SessionLocal, engine
from .models import Inspector, Facility, Equipment, Inspection, RoleEnum, RiskLevelEnum, EquipmentStatusEnum, InspectionResultEnum
from .routers import auth, database, equipment, facilities, inspections, inspectors, users
from .security import hash_password

# --- Конфигурация логирования сервера ---
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S"
)
logger = logging.getLogger("pozhnadzor_backend")

app = FastAPI(title="ПожНадзор.pro API", version="1.0.0")

# --- Глобальный обработчик Exception ---
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.error(f"Необработанный сбой {request.method} {request.url.path}: {str(exc)}", exc_info=True)
    return JSONResponse(
        status_code=500,
        content={"detail": "Внутренняя ошибка сервера. Пожалуйста, обратитесь к администратору"}
    )

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

for prefix in ["/api", ""]:
    app.include_router(auth.router, prefix=prefix)
    app.include_router(users.router, prefix=prefix)
    app.include_router(inspectors.router, prefix=prefix)
    app.include_router(facilities.router, prefix=prefix)
    app.include_router(equipment.router, prefix=prefix)
    app.include_router(inspections.router, prefix=prefix)
    app.include_router(database.router, prefix=prefix)

def seed_initial_data():
    db = SessionLocal()
    try:
        # Проверяем и создаем администраторов при необходимости
        admin_emails = [
            {
                "full_name": "Быков Дмитрий Алексеевич",
                "rank": "Майор внутренней службы",
                "phone": "+7 (950) 063-45-97",
                "email": "dbykov141@gmail.com",
            },
            {
                "full_name": "Быков Дмитрий Алексеевич",
                "rank": "Полковник внутренней службы",
                "phone": "+7 (999) 112-01-01",
                "email": "dbykov338@gmail.com",
            }
        ]
        for admin_info in admin_emails:
            existing = db.scalar(select(Inspector).where(Inspector.email == admin_info["email"]))
            if not existing:
                admin = Inspector(
                    full_name=admin_info["full_name"],
                    rank=admin_info["rank"],
                    phone=admin_info["phone"],
                    email=admin_info["email"],
                    password_hash=hash_password("AdminPass2026!"),
                    role=RoleEnum.admin
                )
                db.add(admin)
                db.commit()
                db.refresh(admin)
                logger.info(f">>> Создан первичный администратор {admin_info['email']}")
    except Exception as e:
        logger.error(f"Ошибка сидирования: {e}")
        db.rollback()
    finally:
        db.close()

@app.on_event("startup")
def on_startup():
    try:
        Base.metadata.create_all(bind=engine)
        seed_initial_data()
        logger.info("PostgreSQL готова к работе")
    except Exception as e:
        logger.warning(f"Ошибка БД: {e}")

@app.get("/health")
@app.get("/api/health")
def health_check():
    return {"status": "ok", "app": "ПожНадзор.pro"}
