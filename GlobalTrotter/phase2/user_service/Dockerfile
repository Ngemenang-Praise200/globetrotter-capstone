# Build from the phase2/ folder: docker build -f user_service/Dockerfile -t globetrotter-user .
# (docker-compose.yml already points at the right context — this note is for manual builds.)
FROM python:3.12-slim
WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt gunicorn

COPY user_service/ user_service/
WORKDIR /app/user_service

ENV PORT=5001
EXPOSE 5001
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s CMD python -c "import urllib.request,os; urllib.request.urlopen(f'http://localhost:{os.environ.get(\"PORT\",5001)}/health')" || exit 1

CMD gunicorn app:app --bind 0.0.0.0:${PORT} --workers 2 --threads 4
