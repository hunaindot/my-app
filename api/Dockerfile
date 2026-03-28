FROM python:3.12-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY main.py .

# documents.sqlite is expected at /data/documents.sqlite (Fly volume)
# Override DB_PATH via env if needed
ENV DB_PATH=/data/documents.sqlite

EXPOSE 8000
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
