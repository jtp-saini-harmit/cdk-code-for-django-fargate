#!/bin/bash
set -e

echo "Waiting for database..."
while ! nc -z $DATABASE_HOST $DATABASE_PORT; do
  sleep 1
done
echo "Database is available"

echo "Running migrations..."
python manage.py migrate --noinput

echo "Creating initial data..."
python manage.py create_initial_data

echo "Collecting static files..."
python manage.py collectstatic --noinput

echo "Creating superuser if not exists..."
python manage.py shell << END
from django.contrib.auth import get_user_model
User = get_user_model()
if not User.objects.filter(username='admin').exists():
    User.objects.create_superuser('admin', 'admin@example.com', 'admin')
else:
    user = User.objects.get(username='admin')
    user.set_password('admin')
    user.save()
END

echo "Starting Gunicorn..."
exec gunicorn product_management.wsgi:application \
    --bind 0.0.0.0:8000 \
    --workers ${GUNICORN_WORKERS:-4} \
    --timeout 120 \
    --access-logfile - \
    --error-logfile - \
    --log-level info
