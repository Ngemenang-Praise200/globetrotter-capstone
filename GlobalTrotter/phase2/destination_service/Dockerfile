FROM python:3.12-slim
WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt gunicorn

COPY destination_service/ destination_service/
WORKDIR /app/destination_service

ENV PORT=5002
EXPOSE 5002
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s CMD python -c "import urllib.request,os; urllib.request.urlopen(f'http://localhost:{os.environ.get(\"PORT\",5002)}/health')" || exit 1

CMD gunicorn app:app --bind 0.0.0.0:${PORT} --workers 2 --threads 4
