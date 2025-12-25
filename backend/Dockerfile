# backend/Dockerfile

FROM python:3.11-slim

# Prevent Python from writing .pyc files and enable unbuffered stdout/stderr
ENV PYTHONDONTWRITEBYTECODE 1
ENV PYTHONUNBUFFERED 1

# Set working directory
WORKDIR /code

# Install system dependencies
# Use netcat-openbsd instead of netcat (Debian slim replacement)
RUN apt-get update && apt-get install -y \
    build-essential \
    curl \
    libpq-dev \
    netcat-openbsd \
    --no-install-recommends && \
    rm -rf /var/lib/apt/lists/*

# Copy and install Python dependencies
COPY requirements.txt .
RUN pip install --upgrade pip
RUN pip install -r requirements.txt

# Copy project files
COPY . .

# Make entrypoint executable inside the container
RUN chmod +x /code/entrypoint.sh

# Expose port
EXPOSE 8000

# Set default command
CMD ["/code/entrypoint.sh"]
