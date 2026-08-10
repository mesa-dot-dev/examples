#!/usr/bin/env python3

# To run this example, create a .env file in this directory with:
#   MESA_ORG=your-org
#   MESA_PRIVATE_KEY=your-signing-private-key
#   DAYTONA_API_KEY=your-daytona-key
#
# Then run:
#   uv run main.py

import asyncio
import os
from dotenv import load_dotenv
from daytona import Daytona
from mesa_sdk import Mesa

from repl import tiny_daytona_repl

load_dotenv()

ORG = os.environ.get("MESA_ORG")
MESA_PRIVATE_KEY = os.environ.get("MESA_PRIVATE_KEY")
DAYTONA_API_KEY = os.environ.get("DAYTONA_API_KEY")

missing_env_vars = []
if not ORG:
    missing_env_vars.append("MESA_ORG")
if not MESA_PRIVATE_KEY:
    missing_env_vars.append("MESA_PRIVATE_KEY")
if not DAYTONA_API_KEY:
    missing_env_vars.append("DAYTONA_API_KEY")

if missing_env_vars:
    raise SystemExit(f"Error: Environment variables not set: {', '.join(missing_env_vars)}")


# Mint a short-lived access token OUTSIDE the sandbox, where your private key lives.
# Only this token is injected into the sandbox below — your signing private key
# never crosses the boundary. Signing is local (no network round-trip) and the
# token expires on its own, so a compromised sandbox leaks at most a
# soon-to-expire, narrowly-scoped credential.
async def mint_token() -> str:
    async with Mesa(private_key=MESA_PRIVATE_KEY) as mesa:
        result = await mesa.tokens.create(
            authors=[{"name": "Sandbox Agent", "email": "agent@example.com"}],
            scopes=["read", "write"],
            # Optionally restrict the token to specific repos (full `org/repo` names):
            #   repos=[f"{ORG}/my-repo"],
            ttl_seconds=60 * 60,  # 1 hour (max 4h). The mount lasts exactly this long.
        )
        return result.token


token = asyncio.run(mint_token())

print("Creating Daytona sandbox...")
daytona = Daytona()
sandbox = daytona.create()

try:
    # Set up Mesa within the Daytona sandbox.
    #
    # We recommend installing Mesa as part of the container definition (ex. Docker image),
    # but here we install it directly to keep the example small.

    # You can install Mesa as per the guide in https://docs.mesa.dev/content/mesafs/posix-mount.
    #
    # Mesa's installer will install all its dependencies through your system's package manager.
    print("Installing Mesa...")
    sandbox.process.exec("curl -fsSL https://mesa.dev/install.sh | sh")

    # It is critical that you enable the user_allow_other flag in your fuse configuration.
    #
    # This allows users outside of yourself to also access the mesa mount you mounted. Mesa requires this for
    # operation. See https://www.man7.org/linux/man-pages/man8/mount.fuse3.8.html for more details.
    print("Configuring FUSE...")
    sandbox.process.exec(
        "sudo sed -i 's/^#user_allow_other/user_allow_other/' /etc/fuse.conf"
    )

    # You can run mesa in daemon mode to kick it off in the background.
    #
    # The flag we are using here is:
    #   -d, --daemonize  Spawns mesa in the background.
    #
    # We pass two environment variables:
    #   MESA_ORG           tells mesa which organization to mount.
    #   MESA_ACCESS_TOKEN  provides the credential for this process; here we pass
    #                      the short-lived token we minted above, so the private
    #                      key never enters the sandbox. See
    #                      https://docs.mesa.dev/content/reference/mesa-cli-configuration.
    #
    # The token is read from the environment and is never persisted to disk.
    print("Mounting Mesa...")
    sandbox.process.exec(f"MESA_ORG={ORG} MESA_ACCESS_TOKEN={token} mesa mount -d")

    # You can now explore repos in your org. We've written a tiny REPL here you can use to explore the sandbox.
    # Your files will be in ~/.local/share/mesa/mnt/<org>/<repo>
    tiny_daytona_repl(sandbox, cwd=f"~/.local/share/mesa/mnt/{ORG}")
finally:
    # No matter what happens, let's make sure we clean up the sandbox so we don't burn Daytona tokens!
    print("Cleaning up sandbox...")
    sandbox.delete()
    print("Bye!")
