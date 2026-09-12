# IMPORTANT: build this from the PROJECT ROOT (the GlobalTrotter/ folder), not from
# inside phase2/, because gateway.py serves files from ../public:
#   docker build -f phase2/gateway.Dockerfile -t globetrotter-gateway .
# docker-compose.yml already sets the right context — this note is for manual builds.

FROM python:3.12-slim
WORKDIR /app

COPY phase2/requirements.txt phase2/requirements.txt
RUN pip install --no-cache-dir -r phase2/requirements.txt gunicorn

COPY phase2/gateway.py phase2/gateway.py
COPY public/ public/

WORKDIR /app/phase2

ENV PORT=5050
EXPOSE 5050
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s CMD python -c "import urllib.request,os; urllib.request.urlopen(f'http://localhost:{os.environ.get(\"PORT\",5050)}/api/health')" || exit 1

CMD gunicorn gateway:app --bind 0.0.0.0:${PORT} --workers 2 --threads 4
