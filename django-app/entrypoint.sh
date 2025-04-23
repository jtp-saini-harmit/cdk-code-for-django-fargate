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

# Start uWSGI in background
echo "Starting uWSGI..."
uwsgi --ini /app/uwsgi.ini &

# Wait for uWSGI socket to be created
while [ ! -S /tmp/uwsgi.sock ]; do
    echo "Waiting for uWSGI socket..."
    sleep 1
done

# Ensure proper permissions for the socket
chmod 666 /tmp/uwsgi.sock

echo "Starting Nginx..."
nginx -g "daemon off;"
