from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "Mock AI Interview API"
    app_env: str = "development"
    app_host: str = "0.0.0.0"
    app_port: int = 8000
    database_url: str = "postgresql://postgres:[YOUR-PASSWORD]@db.[PROJECT-REF].supabase.co:5432/postgres?sslmode=require"
    jwt_secret: str = "replace-this-secret"
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 60
    upload_dir: str = "uploads"

    vapi_api_key: str = ""
    vapi_public_key: str = ""
    vapi_webhook_secret: str = ""
    vapi_base_url: str = "https://api.vapi.ai"

    gemini_api_key: str = ""
    evaluation_model: str = "gemini-2.0-flash"

    google_client_id: str = ""
    apple_client_id: str = ""

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")


settings = Settings()
