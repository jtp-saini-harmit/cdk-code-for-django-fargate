FROM python:3.10-slim

WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

# Install system dependencies and Nginx
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        build-essential \
        gettext \
        nginx \
        netcat-traditional \
        libpcre3-dev \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements and install Python packages
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy Nginx configuration
COPY nginx.conf /etc/nginx/nginx.conf
RUN mkdir -p /run/nginx

# Copy uWSGI configuration
COPY uwsgi.ini /app/uwsgi.ini

# Copy application code
COPY product_management /app/
COPY entrypoint.sh /app/

# Create directories for static and media files
RUN mkdir -p /app/static /app/media \
    && chown -R www-data:www-data /app/static /app/media

# Make entrypoint executable
RUN chmod +x /app/entrypoint.sh

# Expose port 80 for Nginx
EXPOSE 80

CMD ["/app/entrypoint.sh"]
