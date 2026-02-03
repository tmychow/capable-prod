# Axonic Server

A FastAPI backend for experiment management.

## Project Structure

```
backend/
├── app/
│   ├── api/                    # API Layer
│   │   └── v1/                 # API versioning
│   │       ├── endpoints/      # Route handlers (e.g., experiments.py)
│   │       └── api.py          # Main router
│   │
│   ├── core/                   # App Configuration
│   │   ├── config.py           # Pydantic Settings (DB URLs, JWT secrets)
│   │   └── security.py         # JWT & password hashing
│   │
│   ├── crud/                   # Database Operations
│   │   └── crud_experiment.py  # Reusable DB queries
│   │
│   ├── models/                 # SQLAlchemy Models
│   │   └── experiment.py
│   │
│   ├── schemas/                # Pydantic Schemas (Request/Response validation)
│   │   └── experiment.py
│   │
│   ├── db/                     # Database Connection
│   │   ├── session.py          # SQLAlchemy session generator
│   │   └── base.py             # Model imports for Alembic
│   │
│   └── main.py                 # Application entry point
│
├── tests/                      # Test suite
├── .env                        # Environment variables (do not commit)
├── Dockerfile
└── requirements.txt
```

## Getting Started

1. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```

2. Set up environment variables in `.env`

3. Start the server:
   ```bash
   uvicorn app.main:app --reload
   ```

## Testing

```bash
pytest tests/
```

## License

Proprietary