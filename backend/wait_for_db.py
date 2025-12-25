# backend/wait_for_db.py
import os
import time
from urllib.parse import urlparse
import psycopg2

DATABASE_URL = os.environ.get(
    "DATABASE_URL", "postgres://guarduser:guardpass@db:5432/guardsdb"
)

def parse_database_url(url):
    # url like: postgres://user:pass@host:port/dbname
    result = urlparse(url)
    return {
        "dbname": result.path.lstrip("/"),
        "user": result.username,
        "password": result.password,
        "host": result.hostname,
        "port": result.port or 5432,
    }

db_conf = parse_database_url(DATABASE_URL)

print("Waiting for database at {}:{}...".format(db_conf["host"], db_conf["port"]))

while True:
    try:
        conn = psycopg2.connect(
            dbname=db_conf["dbname"],
            user=db_conf["user"],
            password=db_conf["password"],
            host=db_conf["host"],
            port=db_conf["port"],
            connect_timeout=3,
        )
        conn.close()
        print("Database available")
        break
    except Exception as e:
        print("Waiting for database... (%s)" % e)
        time.sleep(1)
