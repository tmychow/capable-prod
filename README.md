# Capable

A full-stack application for experiment management.

## Project Structure

```
capable-core/
├── capable-server/    # FastAPI backend
└── capable-web/       # Web frontend
```

## Components

### [capable-server](./capable-server)

FastAPI backend providing REST APIs for experiment management.

- **Tech Stack:** Python, FastAPI
- **Auth:** JWT-based authentication

### [capable-web](./capable-web)

Web application frontend.

## Getting Started

### Prerequisites

- Python 3.10+
- Node.js 18+

### Setup

1. **Backend:**
   ```bash
   cd capable-server
   pip install -r requirements.txt
   uvicorn app.index:app --reload
   ```

2. **Frontend:**
   ```bash
   cd capable-web
   npm install
   npm run dev
   ```

## License

Proprietary
