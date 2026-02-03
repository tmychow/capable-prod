# Axonic Server

A FastAPI backend for experiment management.

## Project Structure

```
capable-server/
├── api/
│   │
│   ├── ...                     # Other files 
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