#!/usr/bin/env bash
set -euo pipefail

# Export Infisical secrets into a local dotenv file for this repo.
# Requires the Infisical CLI to be authenticated already.
INFISICAL_ENV_NAME="${INFISICAL_ENV_NAME:-dev}"
INFISICAL_SECRET_PATH="${INFISICAL_SECRET_PATH:-/}"

if ! command -v infisical >/dev/null 2>&1; then
  echo "Infisical CLI is required."
  exit 1
fi

infisical export --env="$INFISICAL_ENV_NAME" --path="$INFISICAL_SECRET_PATH" --format=dotenv-export --output-file=.env.local
