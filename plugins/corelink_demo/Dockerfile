FROM python:3.11-slim

# Stream Python stdout/stderr unbuffered so [demo-plugin] log lines surface in
# `docker logs` immediately rather than sitting in a buffer until the process
# exits. Critical for live debugging of the corelink connect / data flow.
ENV PYTHONUNBUFFERED=1

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY main.py .

EXPOSE 8080

RUN useradd --no-create-home --shell /bin/false appuser
USER appuser

CMD ["python", "main.py"]
