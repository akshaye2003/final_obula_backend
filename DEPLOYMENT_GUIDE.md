# Production Deployment Guide

## Prerequisites

- Server with Ubuntu 22.04 LTS (or similar)
- Domain name configured
- SSL certificate (Let's Encrypt)
- Docker and Docker Compose installed

---

## Step 1: Server Setup

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
sudo usermod -aG docker $USER

# Install Docker Compose
sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose

# Install Nginx
sudo apt install -y nginx

# Install certbot for SSL
sudo apt install -y certbot python3-certbot-nginx
```

---

## Step 2: Environment Setup

```bash
# Create app directory
mkdir -p /opt/obula
cd /opt/obula

# Create production .env file
sudo nano backend/.env
```

Add these (replace with your actual values):
```
# OpenAI (required)
OPENAI_API_KEY=your-new-rotated-key

# Supabase
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
SUPABASE_JWT_SECRET=your-jwt-secret

# Razorpay (optional)
RAZORPAY_KEY_ID=your-key
RAZORPAY_KEY_SECRET=your-secret

# API config
MAX_UPLOAD_MB=500
```

---

## Step 3: Create Docker Compose

```bash
sudo nano docker-compose.yml
```

```yaml
version: '3.8'

services:
  backend:
    build:
      context: ./backend
      dockerfile: Dockerfile
    container_name: obula-backend
    restart: unless-stopped
    ports:
      - "8000:8000"
    env_file:
      - ./backend/.env
    volumes:
      - ./backend/uploads:/app/uploads
      - ./backend/outputs:/app/outputs
      - ./backend/data:/app/data
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8000/api/health"]
      interval: 30s
      timeout: 10s
      retries: 3
    deploy:
      resources:
        limits:
          cpus: '4'
          memory: 8G

  frontend:
    build:
      context: ./frontend
      dockerfile: Dockerfile
    container_name: obula-frontend
    restart: unless-stopped
    ports:
      - "3000:80"
    depends_on:
      - backend

  nginx:
    image: nginx:alpine
    container_name: obula-nginx
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf:ro
      - ./ssl:/etc/nginx/ssl:ro
    depends_on:
      - backend
      - frontend
```

---

## Step 4: Create Backend Dockerfile

```bash
sudo nano backend/Dockerfile
```

```dockerfile
FROM python:3.11-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    ffmpeg \
    libgl1-mesa-glx \
    libglib2.0-0 \
    libsm6 \
    libxext6 \
    libxrender-dev \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements
COPY requirements-api.txt .
RUN pip install --no-cache-dir -r requirements-api.txt

# Copy application
COPY . .

# Create non-root user
RUN useradd -m -u 1000 appuser && chown -R appuser:appuser /app
USER appuser

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD curl -f http://localhost:8000/api/health || exit 1

EXPOSE 8000

CMD ["uvicorn", "api:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "2"]
```

---

## Step 5: Create Frontend Dockerfile

```bash
sudo nano frontend/Dockerfile
```

```dockerfile
# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./
RUN npm ci

# Copy source and build
COPY . .
RUN npm run build

# Production stage
FROM nginx:alpine

# Copy built files
COPY --from=builder /app/dist /usr/share/nginx/html

# Copy nginx config
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
```

---

## Step 6: Create Nginx Config

```bash
sudo nano nginx.conf
```

```nginx
events {
    worker_connections 1024;
}

http {
    upstream backend {
        server backend:8000;
    }

    upstream frontend {
        server frontend:80;
    }

    # Rate limiting
    limit_req_zone $binary_remote_addr zone=api:10m rate=10r/s;
    limit_req_zone $binary_remote_addr zone=upload:10m rate=1r/m;

    server {
        listen 80;
        server_name your-domain.com;

        # Security headers
        add_header X-Frame-Options "SAMEORIGIN" always;
        add_header X-Content-Type-Options "nosniff" always;
        add_header X-XSS-Protection "1; mode=block" always;
        add_header Referrer-Policy "strict-origin-when-cross-origin" always;

        # API routes
        location /api/ {
            limit_req zone=api burst=20 nodelay;
            proxy_pass http://backend/;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
            proxy_read_timeout 300s;
            proxy_connect_timeout 75s;
        }

        # Upload endpoint (stricter limits)
        location /api/upload {
            limit_req zone=upload burst=5 nodelay;
            client_max_body_size 500M;
            proxy_pass http://backend/api/upload;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_read_timeout 300s;
        }

        # Frontend
        location / {
            proxy_pass http://frontend;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
        }

        # Static files caching
        location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg)$ {
            expires 1y;
            add_header Cache-Control "public, immutable";
        }
    }
}
```

---

## Step 7: Deploy

```bash
cd /opt/obula

# Build and start
sudo docker-compose up -d --build

# Check logs
sudo docker-compose logs -f

# Verify health
curl http://localhost/api/health
```

---

## Step 8: SSL Certificate

```bash
# Using Let's Encrypt
sudo certbot --nginx -d your-domain.com

# Auto-renewal test
sudo certbot renew --dry-run
```

---

## Monitoring

```bash
# Install monitoring stack
docker run -d \
  --name=portainer \
  -p 9000:9000 \
  -v /var/run/docker.sock:/var/run/docker.sock \
  portainer/portainer-ce

# Access at http://your-server:9000
```

---

## Backup Strategy

```bash
# Create backup script
sudo nano /opt/backup.sh
```

```bash
#!/bin/bash
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR=/backups

# Backup uploads
tar -czf $BACKUP_DIR/uploads_$DATE.tar.gz /opt/obula/backend/uploads

# Backup outputs
tar -czf $BACKUP_DIR/outputs_$DATE.tar.gz /opt/obula/backend/outputs

# Keep only last 7 days
find $BACKUP_DIR -name "*.tar.gz" -mtime +7 -delete
```

```bash
chmod +x /opt/backup.sh

# Add to crontab (daily at 2 AM)
echo "0 2 * * * /opt/backup.sh" | sudo crontab -
```

---

## Troubleshooting

### Backend won't start
```bash
sudo docker-compose logs backend
```

### Frontend build fails
```bash
cd frontend && npm run build
```

### Out of disk space
```bash
# Clean Docker
sudo docker system prune -a

# Clean old uploads
find /opt/obula/backend/uploads -mtime +7 -delete
```

---

## Security Checklist

- [ ] Firewall enabled (ufw)
- [ ] SSH key auth only
- [ ] Automatic security updates
- [ ] Fail2ban installed
- [ ] SSL certificate valid
- [ ] Rate limiting active
- [ ] API keys rotated
- [ ] Logs monitored

---

## Support

For issues, check:
1. Application logs: `sudo docker-compose logs`
2. Nginx logs: `sudo tail -f /var/log/nginx/error.log`
3. System resources: `htop` or `docker stats`
