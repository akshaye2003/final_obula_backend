#!/bin/bash
# ============================================================
# Obula Production Deployment Script
# ============================================================

set -e  # Exit on error

echo "🚀 Obula Production Deployment"
echo "=============================="

# Configuration
BACKEND_DIR="backend"
FRONTEND_DIR="frontend"
PYTHON_VERSION="3.10"
NODE_VERSION="20"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# ============================================================
# Pre-flight Checks
# ============================================================
echo -e "\n${YELLOW}📋 Running pre-flight checks...${NC}"

# Check if .env files exist
if [ ! -f "$BACKEND_DIR/.env" ]; then
    echo -e "${RED}❌ Backend .env file missing!${NC}"
    echo "Copy $BACKEND_DIR/.env.example to $BACKEND_DIR/.env and fill in your values."
    exit 1
fi

if [ ! -f "$FRONTEND_DIR/.env" ]; then
    echo -e "${RED}❌ Frontend .env file missing!${NC}"
    echo "Copy $FRONTEND_DIR/.env.example to $FRONTEND_DIR/.env and fill in your values."
    exit 1
fi

# Check for secrets in git
echo "🔍 Checking for secrets in git history..."
if git rev-parse --git-dir > /dev/null 2>&1; then
    if git log --all --full-history --source -S "OPENAI_API_KEY" -- . | grep -q "commit"; then
        echo -e "${RED}⚠️  WARNING: API keys may be in git history!${NC}"
        echo "Run: git filter-repo --path .env --invert-paths"
        echo "Or: bfg --delete-files .env"
        read -p "Continue anyway? (y/N) " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            exit 1
        fi
    fi
fi

# Check FFmpeg
echo "🔍 Checking FFmpeg..."
if ! command -v ffmpeg &> /dev/null; then
    echo -e "${RED}❌ FFmpeg not found!${NC}"
    echo "Install with: sudo apt-get install ffmpeg"
    exit 1
fi

# Check Python
echo "🔍 Checking Python version..."
python_version=$(python3 --version 2>&1 | awk '{print $2}')
echo "Found Python $python_version"

# ============================================================
# Backend Setup
# ============================================================
echo -e "\n${YELLOW}🔧 Setting up Backend...${NC}"

cd "$BACKEND_DIR"

# Create virtual environment if not exists
if [ ! -d "venv" ]; then
    echo "Creating virtual environment..."
    python3 -m venv venv
fi

# Activate virtual environment
source venv/bin/activate

# Upgrade pip
echo "Upgrading pip..."
pip install --upgrade pip

# Install production dependencies
echo "Installing production dependencies..."
pip install -r requirements-production.txt

# Verify critical imports
echo "Verifying imports..."
python3 -c "
import fastapi
import uvicorn
import slowapi
print('✅ Core dependencies OK')
"

# Create necessary directories
echo "Creating directories..."
mkdir -p uploads outputs data/prep data/broll_thumbnails masks_generated gpt_cache

cd ..

# ============================================================
# Frontend Setup
# ============================================================
echo -e "\n${YELLOW}🔧 Setting up Frontend...${NC}"

cd "$FRONTEND_DIR"

# Check Node.js version
echo "Checking Node.js..."
node_version=$(node --version | cut -d'v' -f2)
echo "Found Node.js $node_version"

# Install dependencies
echo "Installing npm dependencies..."
npm ci  # Clean install

# Build for production
echo "Building for production..."
npm run build

# Verify build output
if [ ! -d "dist" ]; then
    echo -e "${RED}❌ Build failed - dist directory not created!${NC}"
    exit 1
fi

cd ..

# ============================================================
# Security Checklist
# ============================================================
echo -e "\n${YELLOW}🔒 Security Checklist${NC}"
echo "=============================="

checks_passed=0
checks_total=0

check() {
    checks_total=$((checks_total + 1))
    if [ $1 -eq 0 ]; then
        echo -e "${GREEN}✅${NC} $2"
        checks_passed=$((checks_passed + 1))
    else
        echo -e "${RED}❌${NC} $2"
    fi
}

# Check 1: .env files are gitignored
check $(grep -q "\.env" .gitignore; echo $?) ".env files in .gitignore"

# Check 2: No secrets in backend/.env.example
check $(grep -q "sk-" backend/.env.example; echo $?) "No real API keys in .env.example"

# Check 3: Debug mode should be off in production
if grep -q "DEBUG=false" backend/.env 2>/dev/null; then
    check 0 "Debug mode disabled"
else
    check 1 "Debug mode configuration"
fi

# Check 4: CORS origins configured
if grep -q "CORS_ORIGINS" backend/.env 2>/dev/null; then
    check 0 "CORS origins configured"
else
    check 1 "CORS origins configuration"
fi

echo ""
echo "Checks passed: $checks_passed/$checks_total"

if [ $checks_passed -lt $checks_total ]; then
    echo -e "${YELLOW}⚠️  Some security checks failed. Review before deploying.${NC}"
fi

# ============================================================
# Production Start Commands
# ============================================================
echo -e "\n${GREEN}✅ Setup Complete!${NC}"
echo "=============================="
echo ""
echo "To start the production server:"
echo ""
echo "1. Start Backend (Terminal 1):"
echo "   cd backend"
echo "   source venv/bin/activate"
echo "   gunicorn api:app -w 4 -k uvicorn.workers.UvicornWorker --bind 0.0.0.0:8000 --access-logfile - --error-logfile -"
echo ""
echo "2. Serve Frontend (Terminal 2):"
echo "   Option A - Nginx (Recommended):"
echo "   sudo nginx -c /path/to/nginx.conf"
echo ""
echo "   Option B - Python (Testing only):"
echo "   cd frontend/dist"
echo "   python3 -m http.server 5173"
echo ""
echo "3. Or use Docker Compose:"
echo "   docker-compose up -d"
echo ""
echo "=============================="
echo -e "${GREEN}🎉 Ready for production!${NC}"
