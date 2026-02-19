@echo off
echo Starting Deployment Process...

:: 1. Rebuild and restart containers
echo Rebuilding and restarting containers...
docker-compose up -d --build

:: 2. Clean up unused images (optional)
echo Cleaning up unused Docker images...
docker image prune -f

echo Deployment complete!
echo To view logs, run: docker-compose logs -f
pause
