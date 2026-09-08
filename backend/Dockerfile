FROM python:3.12-slim

WORKDIR /app

# curl для проверки здоровья контейнера, без тяжелого gcc (psycopg2-binary не требует компиляции)
RUN apt-get update && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY app ./app

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
