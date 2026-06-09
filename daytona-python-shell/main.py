#!/usr/bin/env python3

# To run this example, create a .env file in this directory with:
#   MESA_ORG=your-org
#   MESA_API_KEY=your-mesa-key
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
MESA_API_KEY = os.environ.get("MESA_API_KEY")
DAYTONA_API_KEY = os.environ.get("DAYTONA_API_KEY")

missing_env_vars = []
if not ORG:
    missing_env_vars.append("MESA_ORG")
if not MESA_API_KEY:
    missing_env_vars.append("MESA_API_KEY")
if not DAYTONA_API_KEY:
    missing_env_vars.append("DAYTONA_API_KEY")

if missing_env_vars:
    raise SystemExit(f"Error: Environment variables not set: {', '.join(missing_env_vars)}")


# Mint a short-lived access token OUTSIDE the sandbox, where your API key lives.
# Only this token is injected into the sandbox below — your long-lived API key
# never crosses the boundary. Signing is local (no network round-trip) and the
# token expires on its own, so a compromised sandbox leaks at most a
# soon-to-expire, narrowly-scoped credential.
async def mint_token() -> str:
    async with Mesa(api_key=MESA_API_KEY, org=ORG) as mesa:
        result = await mesa.tokens.create(
            scopes=["read", "write"],
            # Optionally restrict the token to specific repos (full `org/repo` names):
            #   repos=[f"{ORG}/my-repo"],
            ttl_seconds=60 * 60,  # 1 hour (max 24h). The mount lasts exactly this long.
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

    # You can install Mesa as per the guide in https://docs.mesa.dev/content/virtual-filesystem/os-level.
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
    # The flags we are using here are:
    #   -d,--daemonize       Spawns mesa in the background
    #   -y,--non-interactive Tells mesa to use the default values for all its configuration values. It will create a
    #                        new config file for you.
    #
    # We pass two environment variables:
    #   MESA_ORG       tells mesa which organization to add to config.toml.
    #   MESA_API_KEY   provides the credential for this process. It accepts an
    #                  API key OR an access token; here we pass the short-lived
    #                  token we minted above, so the raw API key never enters the
    #                  sandbox. See
    #                  https://docs.mesa.dev/content/reference/mesa-cli-configuration.
    #
    # Mesa writes only the organization to config.toml on first boot; the token
    # is read from the environment and is never persisted to disk.
    print("Mounting Mesa...")
    sandbox.process.exec(f"MESA_ORG={ORG} MESA_API_KEY={token} mesa mount -d -y")

    # You can now explore repos in your org. We've written a tiny REPL here you can use to explore the sandbox.
    # The default configuration is created in ~/.config/mesa/config.toml
    # and your files will be in ~/.local/share/mesa/mnt/<org>/<repo>
    tiny_daytona_repl(sandbox, cwd=f"~/.local/share/mesa/mnt/{ORG}")
finally:
    # No matter what happens, let's make sure we clean up the sandbox so we don't burn Daytona tokens!
    print("Cleaning up sandbox...")
    sandbox.delete()
    print("Bye!")
