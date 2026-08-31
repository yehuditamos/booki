#!/usr/bin/env bash
set -euo pipefail

PROJECT_ID="${BOOKI_GCP_PROJECT:-mitarim-reading}"
REGION="${BOOKI_GCP_REGION:-europe-west1}"
SERVICE="${BOOKI_ENGINE_SERVICE:-booki-owned-reading-engine}"
ACCESS_CODE="${BOOKI_ENGINE_ACCESS_CODE:-}"

if [[ ! "$ACCESS_CODE" =~ ^[a-f0-9]{64}$ ]]; then
  echo "BOOKI_ENGINE_ACCESS_CODE must be a private 64-character lowercase hex value." >&2
  exit 1
fi

gcloud services enable \
  run.googleapis.com \
  cloudbuild.googleapis.com \
  artifactregistry.googleapis.com \
  --project "$PROJECT_ID"

gcloud run deploy "$SERVICE" \
  --project "$PROJECT_ID" \
  --region "$REGION" \
  --source . \
  --allow-unauthenticated \
  --cpu 4 \
  --memory 16Gi \
  --gpu 1 \
  --gpu-type nvidia-l4 \
  --no-gpu-zonal-redundancy \
  --no-cpu-throttling \
  --cpu-boost \
  --min-instances 0 \
  --max-instances 1 \
  --concurrency 1 \
  --timeout 900 \
  --set-env-vars "BOOKI_ENGINE_ACCESS_CODE=${ACCESS_CODE},BOOKI_ALLOWED_ORIGINS=https://yehuditamos.github.io,BOOKI_MAX_SESSION_SECONDS=600"

gcloud run services describe "$SERVICE" \
  --project "$PROJECT_ID" \
  --region "$REGION" \
  --format='value(status.url)'
