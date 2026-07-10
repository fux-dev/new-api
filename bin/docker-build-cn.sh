#!/usr/bin/env bash
# Build new-api docker image with China mirror acceleration.
#
# Does NOT modify the upstream Dockerfile. Instead, it reads the original
# Dockerfile, patches it in-memory via awk to inject mirror configuration,
# and pipes the result to `docker build -f -` via stdin.
#
# Base images (oven/bun, golang, debian) are NOT rewritten — rely on
# /etc/docker/daemon.json registry-mirrors for transparent image acceleration.
#
# Usage:
#   bin/docker-build-cn.sh [IMAGE_NAME] [DOCKERFILE]
#
# Examples:
#   bin/docker-build-cn.sh                                    # new-api:local, Dockerfile
#   bin/docker-build-cn.sh new-api-dev:local Dockerfile.dev   # dev image
#
# Override mirrors via env:
#   CN_NPM_REGISTRY=... CN_GOPROXY=... CN_APT_MIRROR=... bin/docker-build-cn.sh

set -euo pipefail

IMAGE_NAME="${1:-new-api:local}"
DOCKERFILE="${2:-Dockerfile}"

NPM_REGISTRY="${CN_NPM_REGISTRY:-https://registry.npmmirror.com/}"
GOPROXY="${CN_GOPROXY:-https://goproxy.cn,direct}"
APT_MIRROR="${CN_APT_MIRROR:-mirrors.tuna.tsinghua.edu.cn}"

echo ">> Building ${IMAGE_NAME} from ${DOCKERFILE}"
echo ">> NPM_REGISTRY=${NPM_REGISTRY}"
echo ">> GOPROXY=${GOPROXY}"
echo ">> APT_MIRROR=${APT_MIRROR}"
echo ">> (base images accelerated by /etc/docker/daemon.json registry-mirrors)"

awk \
  -v npm="${NPM_REGISTRY}" \
  -v gp="${GOPROXY}" \
  -v apt_mirror="${APT_MIRROR}" '
    # Inject .npmrc write before every `RUN bun install ...` (covers both builder stages).
    /^RUN bun install/ {
        print "RUN echo \"registry=" npm "\" > .npmrc"
    }

    # Set GOPROXY env right after the GOEXPERIMENT line in the golang stage.
    /^ENV GOEXPERIMENT=/ {
        print
        print "ENV GOPROXY=" gp
        next
    }

    # Patch apt sources before the first `RUN apt-get update` in the final stage.
    /^RUN apt-get update/ && !apt_done {
        print "RUN sed -i \"s|deb.debian.org|" apt_mirror "|g\" /etc/apt/sources.list.d/debian.sources /etc/apt/sources.list 2>/dev/null || true"
        apt_done = 1
    }

    { print }
' "${DOCKERFILE}" | docker build -t "${IMAGE_NAME}" -f - .
