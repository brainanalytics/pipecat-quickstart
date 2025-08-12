# Docker Setup for Pipecat Quickstart

This setup allows you to run both the Pipecat AI server and the Next.js client using Docker Compose.

## Prerequisites

- Docker and Docker Compose installed on your system
- API keys for the required services (Deepgram, OpenAI, etc.)

## Quick Start

1. **Set up environment variables:**
   ```bash
   cp .env.docker .env
   ```
   Then edit `.env` and fill in your actual API keys.

2. **Build and run both services:**
   ```bash
   docker-compose up --build
   ```

3. **Access the application:**
   - Client (Next.js): http://localhost:3000
   - Server (Pipecat): http://localhost:7860

## Individual Service Commands

### Build services:
```bash
docker-compose build
```

### Run in detached mode:
```bash
docker-compose up -d
```

### Stop services:
```bash
docker-compose down
```

### View logs:
```bash
# All services
docker-compose logs -f

# Specific service
docker-compose logs -f server
docker-compose logs -f client
```

### Rebuild a specific service:
```bash
docker-compose up --build server
docker-compose up --build client
```

## Development Mode

For development with hot reloading, you can override the client command:

```bash
docker-compose run --rm -p 3000:3000 client npm run dev
```

## Troubleshooting

### Port conflicts:
If ports 3000 or 7860 are already in use, you can change them in `docker-compose.yml`:

```yaml
ports:
  - "3001:3000"  # Use port 3001 instead of 3000
```

### API Key issues:
Make sure your `.env` file has all required API keys and is in the root directory.

### Container rebuilding:
If you make changes to dependencies, rebuild the containers:
```bash
docker-compose down
docker-compose up --build
```

## Services

### Server (Pipecat AI)
- **Port:** 7860
- **Technology:** Python 3.11
- **Main file:** `server/bot.py`

### Client (Next.js)
- **Port:** 3000  
- **Technology:** Node.js 18 with Next.js
- **Build output:** Production build served by Next.js

## Network

Both services run on a custom Docker network (`pipecat-network`) allowing them to communicate with each other using service names as hostnames.
