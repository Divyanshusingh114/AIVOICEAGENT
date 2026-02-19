#!/bin/bash

# Deployment Script for Dockerized Application
# Usage: ./deploy.sh

echo "Starting Deployment Process..."

# 1. Pull latest changes if this is a Git repository
if [ -d ".git" ]; then
    echo "Pulling latest changes from repository..."
    git pull
else
    echo "Not a Git repository, skipping pull."
fi

# 2. Rebuild and restart containers
echo "Rebuilding and restarting containers..."
# -d: Detached mode (run in background)
# --build: Force rebuild of images before starting containers to incorporate changes
docker-compose up -d --build

# 3. Clean up unused images (optional but good for disk space)
echo "Cleaning up unused Docker images..."
docker image prune -f

echo "Deployment complete!"
echo "To view logs, run: docker-compose logs -f"
