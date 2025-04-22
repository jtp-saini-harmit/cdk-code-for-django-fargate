#!/bin/bash

cd /app/product_management

# 静的ファイルの収集
python manage.py collectstatic --noinput

# マイグレーションを実行
python manage.py migrate --noinput

# スーパーユーザーの作成（DJANGO_SUPERUSER_CREATE が true の場合のみ）
if [ "$DJANGO_SUPERUSER_CREATE" = "true" ]; then
    echo "Creating superuser..."
    echo "from django.contrib.auth.models import User; User.objects.filter(username='admin').exists() or User.objects.create_superuser('admin', 'admin@example.com', 'admin')" | python manage.py shell
fi

# uWSGIをソケットモードで起動（本番環境向け設定）
exec uwsgi \
    --socket :8000 \
    --module product_management.wsgi:application \
    --master \
    --processes 3 \
    --threads 2 \
    --enable-threads \
    --reload-on-rss 2048 \
    --reload-on-as 1024 \
    --logto - \
    --log-date \
    --harakiri 300 \
    --chmod-socket=666
