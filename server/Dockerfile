# Use Python 3.11 slim as base image
FROM python:3.11-slim

# Set working directory
WORKDIR /app

# Install system dependencies including OpenGL and audio libraries
RUN apt-get update && apt-get install -y \
    gcc \
    g++ \
    make \
    libgl1-mesa-glx \
    libglib2.0-0 \
    libsm6 \
    libxext6 \
    libxrender-dev \
    libgomp1 \
    libgstreamer1.0-0 \
    gstreamer1.0-plugins-base \
    gstreamer1.0-plugins-good \
    gstreamer1.0-plugins-bad \
    gstreamer1.0-plugins-ugly \
    gstreamer1.0-libav \
    gstreamer1.0-tools \
    libfontconfig1 \
    libice6 \
    libasound2-dev \
    libportaudio2 \
    libportaudiocpp0 \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements first for better caching
COPY requirements.txt .
COPY pyproject.toml .

# Install Python dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Copy the rest of the application
COPY . .

# Set environment variables for Pipecat to bind to all interfaces
ENV PIPECAT_HOST=0.0.0.0
ENV PIPECAT_PORT=7860
ENV HOST=0.0.0.0
ENV PORT=7860

# Expose ports: 7860 for Pipecat, 7870 for the companion WS server
EXPOSE 7860 7870

# Command to run the application
CMD ["python", "bot.py"]
