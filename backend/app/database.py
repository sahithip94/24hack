import os
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import DeclarativeBase, sessionmaker

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./lost_in_transit.db")
_engine_args = {"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {}
engine = create_engine(DATABASE_URL, connect_args=_engine_args, pool_pre_ping=True)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, expire_on_commit=False)

class Base(DeclarativeBase):
    pass


# Additive, non-destructive schema upgrades for databases created before a
# column existed. ``create_all`` only creates missing *tables*, so new columns
# must be added explicitly. Existing rows and data are preserved.
_ADDITIVE_COLUMNS: dict[str, dict[str, str]] = {}

# Columns left over from the removed email-verification feature. Nothing reads
# or writes them any more, but databases created before the feature was removed
# still contain them. They are dropped once on startup so old and new databases
# match. Every other column and all row data is preserved.
_LEGACY_COLUMNS_TO_DROP: dict[str, tuple[str, ...]] = {
    "users": (
        "email_verification_token",
        "email_verification_token_expires_at",
        "verification_email_sent_at",
        "email_verified",
    ),
}


def ensure_schema() -> None:
    """Idempotently reconcile the schema with the current models.

    Adds columns introduced after a database was created and drops the obsolete
    columns left over from the removed email-verification feature. Row data in
    all other columns is preserved.
    """
    inspector = inspect(engine)
    existing_tables = set(inspector.get_table_names())
    with engine.begin() as connection:
        for table, columns in _ADDITIVE_COLUMNS.items():
            if table not in existing_tables:
                continue
            present = {column["name"] for column in inspector.get_columns(table)}
            for name, ddl_type in columns.items():
                if name not in present:
                    connection.execute(text(f'ALTER TABLE "{table}" ADD COLUMN "{name}" {ddl_type}'))
        for table, columns in _LEGACY_COLUMNS_TO_DROP.items():
            if table not in existing_tables:
                continue
            legacy = set(columns)
            # Drop any index that references an obsolete column first: SQLite
            # refuses to drop a column while an index still refers to it.
            for index in inspector.get_indexes(table):
                if set(index.get("column_names") or []) & legacy:
                    connection.execute(text(f'DROP INDEX IF EXISTS "{index["name"]}"'))
            present = {column["name"] for column in inspector.get_columns(table)}
            for name in columns:
                if name in present:
                    connection.execute(text(f'ALTER TABLE "{table}" DROP COLUMN "{name}"'))


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
