#!/bin/bash
set -e

echo "Starting OpenPDF Studio Environment Setup..."

# 1. Check for Homebrew
if ! command -v brew &> /dev/null
then
    echo "Homebrew not found. Please install it first: https://brew.sh/"
    exit 1
fi

echo "Installing system dependencies..."
brew install tesseract tesseract-lang poppler

# 2. Setup Python Virtual Environment
echo "Setting up Python Backend..."
mkdir -p openpdf-backend
cd openpdf-backend

python3 -m venv venv
source venv/bin/activate
pip install --upgrade pip

echo "Installing Python dependencies..."
pip install fastapi uvicorn pymupdf pdf2docx python-multipart

cd ..

# 3. Setup Next.js Frontend
echo "Setting up Next.js Frontend..."
# The user wants Tailwind CSS
npx -y create-next-app@latest openpdf-frontend --typescript --tailwind --eslint --app --src-dir --import-alias "@/*" --use-npm

echo "Environment setup complete!"
echo "Backend: openpdf-backend/"
echo "Frontend: openpdf-frontend/"
