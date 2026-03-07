# RunPod Serverless Worker for Obula Video Processing
# GPU-enabled container for video processing pipeline

FROM python:3.10-slim

# Install system dependencies
RUN apt-get update && apt-get install -y \
    ffmpeg \
    libsm6 \
    libxext6 \
    libgl1 \
    libglib2.0-0 \
    libgomp1 \
    wget \
    git \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Install PyTorch with CUDA support first (takes longest)
RUN pip install --no-cache-dir torch==2.1.0 torchvision==0.16.0 torchaudio==2.1.0 --index-url https://download.pytorch.org/whl/cu121

# Copy requirements and install other dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Install additional required packages
RUN pip install --no-cache-dir runpod supabase requests

# Copy all necessary files
# 1. Main handler
COPY handler.py .

# 2. All Python scripts
COPY scripts/ ./scripts/

# 3. Assets
COPY presets/ ./presets/
COPY color_grading/ ./color_grading/
COPY fonts/ ./fonts/

# Create temp directories
RUN mkdir -p /tmp/inputs /tmp/outputs

# Verify critical files exist
RUN echo "Verifying setup..." && \
    ls -la handler.py && \
    ls -la scripts/pipeline.py && \
    ls -la scripts/video_utils.py && \
    ls presets/ && \
    ls color_grading/ && \
    ls fonts/

# Set environment variables
ENV PYTHONUNBUFFERED=1
ENV PYTHONPATH=/app

# Start the handler
CMD ["python", "-u", "handler.py"]
