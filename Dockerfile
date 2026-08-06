# Use an official Python runtime as a parent image
FROM python:3.10-slim

# Set environment variables
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV FLASK_ENV=production
ENV MALLOC_ARENA_MAX=2

# Install Chrome and ChromeDriver dependencies
RUN apt-get update && apt-get install -y \
    wget \
    gnupg \
    unzip \
    chromium \
    chromium-driver \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Install Python dependencies
COPY requirements.txt /app/
RUN pip install --no-cache-dir -r requirements.txt

# Copy the rest of the application code
COPY . /app/

# Ensure data directory exists
RUN mkdir -p /app/data

# Expose the port the app runs on (Render assigns this dynamically)
EXPOSE 5001

# Command to run the application using Gunicorn with strict memory limits
CMD gunicorn --bind 0.0.0.0:${PORT:-5001} wsgi:app --timeout 120 --workers 1 --threads 2 --preload
