FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /app

# Install dependencies first for better caching
COPY pyproject.toml /app/
RUN pip install --no-cache-dir \
      "fastapi[standard]>=0.115" \
      "uvicorn[standard]>=0.30" \
      "sqlalchemy>=2.0" \
      "pydantic>=2.7" \
      "python-multipart>=0.0.9" \
      "pillow>=10.4"

COPY app /app/app

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
