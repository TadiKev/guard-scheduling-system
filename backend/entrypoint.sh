#!/bin/sh
set -e

echo "Waiting for database..."
while ! nc -z db 5432; do
  sleep 1
done
echo "Database is ready"

# Allow custom commands like makemigrations
if [ "$1" = "python" ]; then
  exec "$@"
fi

echo "Running migrations..."
python manage.py migrate --noinput

echo "Starting ASGI server (Daphne)..."
exec daphne -b 0.0.0.0 -p 8000 core.asgi:application
