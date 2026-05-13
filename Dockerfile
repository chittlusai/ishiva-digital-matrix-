FROM python:3.10-slim

# Install necessary tools and dependencies for Chrome
RUN apt-get update && apt-get install -y wget unzip curl \
    && wget -q https://dl.google.com/linux/direct/google-chrome-stable_current_amd64.deb \
    && apt-get install -y ./google-chrome-stable_current_amd64.deb \
    && rm google-chrome-stable_current_amd64.deb \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy dependencies and install
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY . .

# Run gunicorn with gevent for better streaming/EventSource support
# and a longer timeout for the scraping process
CMD ["gunicorn", "app:app", "--bind", "0.0.0.0:10000", "--timeout", "180", "--workers", "2", "--threads", "4"]
