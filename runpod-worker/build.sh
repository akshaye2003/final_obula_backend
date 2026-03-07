#!/bin/bash
# Build script for RunPod Worker Docker image

set -e

echo "Building RunPod Worker for Obula..."
echo "===================================="

# Configuration
IMAGE_NAME="obula-runpod-worker"
IMAGE_TAG="latest"
RUNPOD_REGISTRY="docker.io/YOUR_USERNAME"  # Change this

# Step 1: Copy required backend scripts
echo "[1/4] Copying backend scripts..."

mkdir -p scripts
mkdir -p presets
mkdir -p color_grading
mkdir -p fonts
mkdir -p movie_clips
mkdir -p movie_clips_portrait

# Copy pipeline scripts
cp ../backend/scripts/*.py scripts/ 2>/dev/null || echo "Warning: Could not copy scripts"

# Copy presets
cp ../backend/presets/*.json presets/ 2>/dev/null || echo "Warning: Could not copy presets"

# Copy LUTs
cp ../backend/color_grading/*.cube color_grading/ 2>/dev/null || echo "Warning: Could not copy LUTs"

# Copy fonts
cp -r ../backend/fonts/* fonts/ 2>/dev/null || echo "Warning: Could not copy fonts"

echo "[2/4] Building Docker image..."

docker build -t ${IMAGE_NAME}:${IMAGE_TAG} .

echo "[3/4] Tagging for registry..."

docker tag ${IMAGE_NAME}:${IMAGE_TAG} ${RUNPOD_REGISTRY}/${IMAGE_NAME}:${IMAGE_TAG}

echo "[4/4] Pushing to registry..."

docker push ${RUNPOD_REGISTRY}/${IMAGE_NAME}:${IMAGE_TAG}

echo ""
echo "===================================="
echo "Build complete!"
echo "Image: ${RUNPOD_REGISTRY}/${IMAGE_NAME}:${IMAGE_TAG}"
echo ""
echo "Next steps:"
echo "1. Update RUNPOD_REGISTRY in this script"
echo "2. Login to Docker Hub: docker login"
echo "3. Run this script to push image"
echo "4. Create RunPod Serverless Endpoint"
echo "5. Configure endpoint with your image"
echo "===================================="
