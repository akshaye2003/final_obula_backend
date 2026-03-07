#!/bin/bash
# Setup script to copy all necessary files from backend/ to runpod-worker/

echo "Setting up RunPod Worker..."

# Create directories
mkdir -p runpod-worker/scripts
mkdir -p runpod-worker/presets
mkdir -p runpod-worker/color_grading
mkdir -p runpod-worker/fonts

# Copy all Python scripts from backend/scripts/
echo "Copying Python scripts..."
cp backend/scripts/*.py runpod-worker/scripts/

# Copy presets
echo "Copying presets..."
cp backend/presets/*.json runpod-worker/presets/

# Copy color grading LUTs
echo "Copying LUT files..."
cp backend/color_grading/*.cube runpod-worker/color_grading/

# Copy fonts
echo "Copying fonts..."
cp backend/fonts/* runpod-worker/fonts/

# Create __init__.py files if they don't exist
touch runpod-worker/scripts/__init__.py

echo "RunPod worker setup complete!"
echo ""
echo "Files copied:"
echo "  - $(ls -1 runpod-worker/scripts/*.py | wc -l) Python scripts"
echo "  - $(ls -1 runpod-worker/presets/*.json | wc -l) preset files"
echo "  - $(ls -1 runpod-worker/color_grading/*.cube | wc -l) LUT files"
echo "  - $(ls -1 runpod-worker/fonts/* | wc -l) font files"
