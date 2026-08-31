FROM nvidia/cuda:12.8.1-cudnn-runtime-ubuntu24.04

ARG BOOKI_MODEL_SOURCE=ivrit-ai/whisper-large-v3-turbo-ct2
ENV DEBIAN_FRONTEND=noninteractive \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    BOOKI_MODEL_DEVICE=cuda \
    BOOKI_MODEL_COMPUTE_TYPE=float16 \
    PORT=8080

RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 python3-pip ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY requirements.txt .
RUN pip3 install --no-cache-dir --break-system-packages -r requirements.txt
RUN mkdir -p /opt/booki-model \
    && python3 -c "from huggingface_hub import snapshot_download; snapshot_download('${BOOKI_MODEL_SOURCE}', local_dir='/opt/booki-model')"

ENV BOOKI_MODEL_ID=/opt/booki-model

COPY app ./app
RUN useradd --create-home --uid 10001 booki \
    && chown -R booki:booki /app /opt/booki-model
USER booki

CMD ["sh", "-c", "python3 -m uvicorn app.main:app --host 0.0.0.0 --port ${PORT} --workers 1 --no-access-log"]
