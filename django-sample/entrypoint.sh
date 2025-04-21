#!/bin/bash

# 静的ファイルの収集
python manage.py collectstatic --noinput

# マイグレーションを実行
python manage.py migrate --noinput

# スーパーユーザーの作成（DJANGO_SUPERUSER_CREATE が true の場合のみ）
if [ "$DJANGO_SUPERUSER_CREATE" = "true" ]; then
    echo "Creating superuser..."
    echo "from django.contrib.auth.models import User; User.objects.filter(username='admin').exists() or User.objects.create_superuser('admin', 'admin@example.com', 'admin')" | python manage.py shell
fi

# Gunicornを起動（本番環境向け設定）
exec gunicorn product_management.wsgi:application \
    --bind 0.0.0.0:8000 \
    --workers 3 \
    --threads 2 \
    --worker-class gthread \
    --worker-tmp-dir /dev/shm \
    --access-logfile - \
    --error-logfile - \
    --log-level info \
    --timeout 300
