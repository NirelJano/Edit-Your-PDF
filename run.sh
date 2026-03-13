#!/bin/bash
set -e

# Path to the base directory where both openpdf-backend and openpdf-frontend reside.
BASE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}Starting Backend API...${NC}"
cd "$BASE_DIR/openpdf-backend"
source venv/bin/activate
uvicorn main:app --port 8000 --reload &
BACKEND_PID=$!

echo -e "${BLUE}Starting Frontend Development Server...${NC}"
cd "$BASE_DIR/openpdf-frontend"
npm run dev &
FRONTEND_PID=$!

echo -e "${GREEN}==================================${NC}"
echo -e "${GREEN}      OpenPDF Studio is LIVE!     ${NC}"
echo -e "${BLUE}  Backend:  ${NC}http://localhost:8000"
echo -e "${BLUE}  Frontend: ${NC}http://localhost:3000"
echo -e "${GREEN}==================================${NC}"
echo "Press Ctrl+C to stop both servers."

# Function to handle graceful shutdown
cleanup() {
  echo ""
  echo "Shutting down servers..."
  kill $BACKEND_PID
  kill $FRONTEND_PID
  exit 0
}

# Trap SIGINT (Ctrl+C) and SIGTERM to run the cleanup function
trap cleanup SIGINT SIGTERM

# Wait indefinitely so the script doesn't exit immediately
wait
