FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY main.py .
EXPOSE 3000
HEALTHCHECK --interval=5s --timeout=3s --start-period=10s \
  CMD python3 -c "import urllib.request; urllib.request.urlopen('http://localhost:3000/health')"
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "3000"]
