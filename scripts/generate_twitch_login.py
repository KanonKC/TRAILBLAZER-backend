import urllib.parse
import os
import argparse
from pathlib import Path

# Setup argument parsing
parser = argparse.ArgumentParser(description="Generate Twitch login URL")
parser.add_argument("--env", choices=["dev", "prod"], default="dev", help="Environment to use (dev or prod)")
args = parser.parse_args()

# Load .env file manually if python-dotenv is not installed
env_file = ".env" if args.env == "dev" else ".env.prod"
env_path = Path(__file__).parent.parent / env_file

if env_path.exists():
    print(f"Loading environment from {env_file}")
    with open(env_path) as f:
        for line in f:
            if line.strip() and not line.startswith("#"):
                key, value = line.strip().split("=", 1)
                os.environ[key] = value.strip('"').strip("'")
else:
    raise Exception(f"{env_file} not found.")

baseUrl = "https://id.twitch.tv/oauth2/authorize"

scopes = [
    "channel:bot",
    "user:read:email",
    "user:read:chat",
    "user:write:chat",
    "user:bot",
    "channel:read:subscriptions",
    "moderator:manage:shoutouts",
    "channel:manage:redemptions",
    "user:read:subscriptions"
]

query = {
    "response_type": "code",
    "client_id": os.getenv("TWITCH_CLIENT_ID"),
    "redirect_uri": os.getenv("TWITCH_REDIRECT_URL"),
    "scope": " ".join(scopes)
}


url = f"{baseUrl}?{urllib.parse.urlencode(query)}"

with open("login.txt", "w") as f:
    f.write(url)

print(url)