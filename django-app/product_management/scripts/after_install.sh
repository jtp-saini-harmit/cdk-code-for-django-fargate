#!/bin/bash
set -e

echo "Starting after install tasks..."

# Collect static files
echo "Collecting static files..."
python manage.py collectstatic --noinput

# Run basic health check
echo "Running application health checks..."
python manage.py check

# Warm up application
echo "Warming up the application..."
curl -f http://localhost/health/ || exit 1

echo "After install tasks completed"
