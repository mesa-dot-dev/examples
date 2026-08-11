#!/usr/bin/env python3

# To run this example, create a .env file in this directory with:
#   MESA_PRIVATE_KEY=your-signing-private-key
#   DAYTONA_API_KEY=your-daytona-key
#
# Then run:
#   uv run main.py

import asyncio
import os
import time

from daytona import CreateSandboxFromImageParams, Daytona, Image
from dotenv import load_dotenv
from mesa_sdk import Mesa
from repl import tiny_daytona_repl

load_dotenv()


MESA_PRIVATE_KEY = os.environ.get("MESA_PRIVATE_KEY")
if not MESA_PRIVATE_KEY:
    raise SystemExit("Error: Environment variable not set: MESA_PRIVATE_KEY")

# Install Mesa and configure FUSE when Daytona builds the image. New sandboxes
# can then start without repeating this setup.
image = Image.base("ubuntu:24.04").run_commands(
    "apt-get update && apt-get install -y --no-install-recommends "
    "ca-certificates curl && rm -rf /var/lib/apt/lists/*",
    "curl -fsSL https://mesa.dev/install.sh | sh -s -- --version 0.44.1 --yes",
    # Enable user_allow_other in FUSE config. This is required for non-root users
    # to access the mounted filesystem.
    "sed -i 's/^#user_allow_other/user_allow_other/' /etc/fuse.conf",
)


async def main() -> None:
    async with Mesa(private_key=MESA_PRIVATE_KEY) as mesa:
        print("Creating Daytona sandbox...")
        daytona = Daytona()
        sandbox = daytona.create(
            CreateSandboxFromImageParams(
                image=image,
                ephemeral=True,
                ttl_minutes=30,  # 30 minutes
            ),
            timeout=10 * 60,  # 10 minutes
        )
        repo = None

        try:
            repo = await mesa.repos.create(name=f"daytona-{int(time.time() * 1000)}")

            # Mint a short-lived access token OUTSIDE the sandbox, where your
            # private key lives. Only this token is injected into the sandbox below —
            # your signing private key never crosses the boundary. Signing is
            # local (no network round-trip) and the token expires on its own, so
            # a compromised sandbox leaks at most a soon-to-expire,
            # narrowly-scoped credential.
            result = await mesa.tokens.create(
                authors=[{"name": "Sandbox Agent", "email": "agent@example.com"}],
                scopes=["read", "write"],
                repos=[f"{repo.org}/{repo.name}"],
                ttl_seconds=30 * 60,  # 30 minutes
            )

            # You can run mesa in daemon mode to kick it off in the background.
            #
            # The flag we are using here is:
            #   -d, --daemonize  Spawns mesa in the background.
            #
            # We pass two environment variables:
            #   MESA_ORG           tells mesa which organization to mount.
            #   MESA_ACCESS_TOKEN  provides the credential for this process; here
            #                      we pass the short-lived token we minted above,
            #                      so the private key never enters the sandbox. See
            #                      https://docs.mesa.dev/content/reference/mesa-cli-configuration.
            #
            # The token is read from the environment and is never persisted to disk.
            # By default, MesaFS mounts every repo the token can access. This token
            # can access only the temporary repo, so that is the only repo MesaFS
            # mounts.
            print("Mounting Mesa...")
            mount = sandbox.process.exec(
                "mesa mount --daemonize",
                env={"MESA_ORG": repo.org, "MESA_ACCESS_TOKEN": result.token},
            )
            if mount.exit_code != 0:
                raise RuntimeError(mount.result)

            # You can now explore the temporary repo. We've written a tiny REPL here
            # you can use to explore the sandbox.
            #
            # Your files will be in ~/.local/share/mesa/mnt/<org>/<repo>.
            repo_path = f"~/.local/share/mesa/mnt/{repo.org}/{repo.name}"
            tiny_daytona_repl(sandbox, cwd=repo_path)
        finally:
            # No matter what happens, let's make sure we clean up the temporary
            # resources so we don't burn Daytona tokens!
            print("Cleaning up sandbox and temporary repo...")
            try:
                sandbox.delete()
            finally:
                if repo is not None:
                    await mesa.repos.delete(repo=repo.name)
            print("Bye!")


asyncio.run(main())
