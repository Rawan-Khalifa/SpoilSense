# Gunicorn configuration for Render deployment
import os

# Server socket
bind = f"0.0.0.0:{os.getenv('PORT', 5000)}"
backlog = 2048

# Worker processes
workers = 1  # Use 1 worker for free tier to avoid memory issues
worker_class = "sync"
worker_connections = 1000
timeout = 60  # Increase worker timeout to 60 seconds (default is 30)
keepalive = 5
max_requests = 1000
max_requests_jitter = 50

# Logging
loglevel = "info"
accesslog = "-"
errorlog = "-"

# Process naming
proc_name = "spoilsense-api"

# Security
limit_request_line = 4094
limit_request_fields = 100
limit_request_field_size = 8190

# Preload app for better memory usage
preload_app = True
