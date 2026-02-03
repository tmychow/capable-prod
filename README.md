<<<<<<< HEAD
# capable-prod
Humans are capable of greatness
=======
# Axonic

A full-stack application for experiment management.

## Project Structure

```
axonic-core/
├── axonic-server/    # FastAPI backend
└── axonic-web/       # Web frontend
```

## Components

### [axonic-server](./axonic-server)

FastAPI backend providing REST APIs for experiment management.

- **Tech Stack:** Python, FastAPI
- **Auth:** JWT-based authentication

### [axonic-web](./axonic-web)

Web application frontend.

## Getting Started

### Prerequisites

- Python 3.10+
- Node.js 18+

### Setup

1. **Backend:**
   ```bash
   cd axonic-server
   pip install -r requirements.txt
   uvicorn app.main:app --reload
   ```

2. **Frontend:**
   ```bash
   cd axonic-web
   npm install
   npm run dev
   ```

## License

Proprietary
>>>>>>> fd153dc (Initial commit + finish web app and fastapi server prototype)
