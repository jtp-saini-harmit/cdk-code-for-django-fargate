#!/bin/bash
set -e

echo "Starting before install tasks..."

# Check if we can reach the database
echo "Checking database connection..."
python manage.py check --database default

# Run database migrations
echo "Running database migrations..."
python manage.py migrate --noinput

echo "Before install tasks completed"
