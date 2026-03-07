#!/bin/bash
# Build and push RunPod Docker image

set -e

# Configuration
IMAGE_NAME="obula-runpod-worker"
DOCKER_USERNAME=${DOCKER_USERNAME:-"your-docker-username"}
VERSION=${VERSION:-"latest"}

# Full image name
FULL_IMAGE_NAME="$DOCKER_USERNAME/$IMAGE_NAME:$VERSION"

echo "=========================================="
echo "Building RunPod Worker Docker Image"
echo "=========================================="
echo "Image: $FULL_IMAGE_NAME"
echo ""

# Ensure all files are present
echo "Checking required files..."

required_files=(
    "handler.py"
    "requirements.txt"
    "Dockerfile"
    "scripts/pipeline.py"
    "scripts/video_utils.py"
    "scripts/caption_renderer.py"
    "scripts/mask_utils.py"
    "scripts/font_manager.py"
    "scripts/config.py"
    "scripts/broll_engine.py"
    "scripts/watermark.py"
    "scripts/animator.py"
    "scripts/caption_formatter.py"
    "scripts/hook_renderer.py"
    "scripts/styled_text_renderer.py"
    "scripts/text_effects.py"
    "scripts/noise_isolator.py"
    "scripts/post_processor.py"
)

for file in "${required_files[@]}"; do
    if [ ! -f "$file" ]; then
        echo "ERROR: Missing required file: $file"
        exit 1
    fi
    echo "  ✓ $file"
done

# Check asset directories
echo ""
echo "Checking asset directories..."

if [ ! -d "presets" ] || [ -z "$(ls -A presets/*.json 2>/dev/null)" ]; then
    echo "ERROR: presets/ directory is empty or missing"
    exit 1
fi
echo "  ✓ presets/ ($(ls presets/*.json | wc -l) files)"

if [ ! -d "color_grading" ] || [ -z "$(ls -A color_grading/*.cube 2>/dev/null)" ]; then
    echo "ERROR: color_grading/ directory is empty or missing"
    exit 1
fi
echo "  ✓ color_grading/ ($(ls color_grading/*.cube | wc -l) files)"

if [ ! -d "fonts" ] || [ -z "$(ls -A fonts/* 2>/dev/null)" ]; then
    echo "ERROR: fonts/ directory is empty or missing"
    exit 1
fi
echo "  ✓ fonts/ ($(ls fonts/* | wc -l) files)"

echo ""
echo "All files present! Building Docker image..."
echo ""

# Build the Docker image
docker build -t "$IMAGE_NAME:$VERSION" .

# Tag with full name
docker tag "$IMAGE_NAME:$VERSION" "$FULL_IMAGE_NAME"

echo ""
echo "=========================================="
echo "Build successful!"
echo "=========================================="
echo ""
echo "To push to Docker Hub:"
echo "  docker push $FULL_IMAGE_NAME"
echo ""
echo "To test locally:"
echo "  docker run --gpus all -e OPENAI_API_KEY=xxx -e SUPABASE_URL=xxx -e SUPABASE_SERVICE_ROLE_KEY=xxx -it --rm $IMAGE_NAME:$VERSION"
echo ""
