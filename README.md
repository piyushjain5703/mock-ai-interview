# mock-ai-interview

MVP scaffold for a Voice AI mock interview platform.

## Structure

- `backend`: FastAPI service scaffold.
- `frontend`: React + TypeScript + Vite scaffold.
- `docs`: shared design and contract notes.

## Local Development

Backend:

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

Set `backend/.env` with your Supabase Postgres connection string:

```bash
DATABASE_URL=postgresql://postgres:<password>@db.<project-ref>.supabase.co:5432/postgres?sslmode=require
JWT_SECRET=<your-jwt-secret>
```

Frontend:

```bash
cd frontend
npm install
npm run dev
```