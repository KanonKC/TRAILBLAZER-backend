"""
Backfill `duration_ms` for existing UploadedFile rows.

Downloads each file from S3, probes its duration with ffprobe, and writes
the result back to the database. Skips rows that already have duration_ms
set, and skips files ffprobe can't read a duration from (e.g. images).

Requirements:
    pip install boto3 psycopg2-binary
    ffprobe must be on PATH (part of ffmpeg).

Usage:
    python scripts/backfill_uploaded_file_duration.py [--env dev|prod] [--dry-run]
"""
import argparse
import json
import os
import subprocess
import tempfile
from pathlib import Path

import boto3
import psycopg2
import psycopg2.extras

parser = argparse.ArgumentParser(description="Backfill UploadedFile.duration_ms")
parser.add_argument("--env", choices=["dev", "prod"], default="dev", help="Environment to use (dev or prod)")
parser.add_argument("--dry-run", action="store_true", help="Probe and print durations without writing to the DB")
args = parser.parse_args()

env_file = ".env" if args.env == "dev" else ".env.prod"
env_path = Path(__file__).parent.parent / env_file

if not env_path.exists():
    raise Exception(f"{env_file} not found.")

print(f"Loading environment from {env_file}")
with open(env_path) as f:
    for line in f:
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            key, value = line.split("=", 1)
            os.environ[key] = value.strip('"').strip("'")

s3 = boto3.client(
    "s3",
    endpoint_url=os.getenv("S3_ENDPOINT") or None,
    region_name=os.getenv("S3_REGION", "us-east-1"),
    aws_access_key_id=os.getenv("S3_ACCESS_KEY"),
    aws_secret_access_key=os.getenv("S3_SECRET_KEY"),
)
BUCKET = os.environ["S3_BUCKET_NAME"]


def probe_duration_ms(file_path: str) -> int | None:
    result = subprocess.run(
        [
            "ffprobe",
            "-v", "error",
            "-show_entries", "format=duration",
            "-of", "json",
            file_path,
        ],
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        return None
    try:
        duration = json.loads(result.stdout)["format"]["duration"]
        return round(float(duration) * 1000)
    except (KeyError, ValueError, json.JSONDecodeError):
        return None


def main():
    conn = psycopg2.connect(os.environ["DATABASE_URL"])
    conn.autocommit = False
    read_cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    write_cur = conn.cursor()

    read_cur.execute(
        'SELECT id, key, name, type FROM "UploadedFile" WHERE duration_ms IS NULL ORDER BY created_at'
    )
    rows = read_cur.fetchall()
    print(f"Found {len(rows)} file(s) without duration_ms")

    updated, skipped, failed = 0, 0, 0

    for row in rows:
        file_id, key, name, mimetype = row["id"], row["key"], row["name"], row["type"]

        with tempfile.NamedTemporaryFile(suffix=Path(name).suffix, delete=False) as tmp:
            tmp_path = tmp.name

        try:
            s3.download_file(BUCKET, key, tmp_path)
            duration_ms = probe_duration_ms(tmp_path)

            if duration_ms is None:
                print(f"  skip  {file_id} ({name}, {mimetype}): no duration found")
                skipped += 1
                continue

            print(f"  {'[dry-run] ' if args.dry_run else ''}update {file_id} ({name}): {duration_ms} ms")
            if not args.dry_run:
                write_cur.execute(
                    'UPDATE "UploadedFile" SET duration_ms = %s WHERE id = %s',
                    (duration_ms, file_id),
                )
                conn.commit()
            updated += 1
        except Exception as e:
            conn.rollback()
            print(f"  FAIL  {file_id} ({name}): {e}")
            failed += 1
        finally:
            os.unlink(tmp_path)

    print(f"\nDone. updated={updated} skipped={skipped} failed={failed}")
    read_cur.close()
    write_cur.close()
    conn.close()


if __name__ == "__main__":
    main()
