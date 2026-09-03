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
from mesa_sdk import Mesa, repo
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
    "curl -fsSL https://mesa.dev/install.sh | sh -s -- --version 0.46.0 --yes",
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
        created = None

        try:
            created = await mesa.repos.create(name=f"daytona-{int(time.time() * 1000)}")

            # Declare the namespace the sandbox gets: this layout is both what
            # the mount presents and what the token is scoped to. Nothing
            # outside it is reachable.
            workspace = mesa.fs(
                layout={"/workspace": repo(created.name, mode="rw")},
                authors=[{"name": "Sandbox Agent", "email": "agent@example.com"}],
                ttl=30 * 60,  # 30 minutes
            )

            # Mint the short-lived access token OUTSIDE the sandbox, where your
            # private key lives. Only this token is injected into the sandbox
            # below — your signing private key never crosses the boundary.
            # Signing is local (no network round-trip) and the token expires on
            # its own, so a compromised sandbox leaks at most a soon-to-expire
            # credential scoped to the layout's repositories.
            result = await workspace.token()

            # You can run mesa in daemon mode to kick it off in the background.
            #
            # The flag we are using here is:
            #   -d, --daemonize  Spawns mesa in the background.
            #
            # The same layout the token was scoped to also describes the mount,
            # so write it into the sandbox and point `mesa mount` at it.
            print("Mounting Mesa...")
            write_layout = sandbox.process.exec(
                f"cat > /tmp/layout.json <<'MESA_LAYOUT'\n{workspace.layout()}\nMESA_LAYOUT",
            )
            if write_layout.exit_code != 0:
                raise RuntimeError(write_layout.result)
            mount = sandbox.process.exec(
                "mesa mount --daemonize --layout /tmp/layout.json",
                env={"MESA_ACCESS_TOKEN": result.token},
            )
            if mount.exit_code != 0:
                raise RuntimeError(mount.result)

            # You can now explore the temporary repo. We've written a tiny REPL here
            # you can use to explore the sandbox.
            #
            # A layout mount presents exactly its declared paths, so the repo
            # is at ~/.local/share/mesa/mnt/workspace — the org browse tree is
            # not present.
            tiny_daytona_repl(sandbox, cwd="~/.local/share/mesa/mnt/workspace")
        finally:
            # No matter what happens, let's make sure we clean up the temporary
            # resources so we don't burn Daytona tokens!
            print("Cleaning up sandbox and temporary repo...")
            try:
                sandbox.delete()
            finally:
                if created is not None:
                    await mesa.repos.delete(repo=created.name)
            print("Bye!")


asyncio.run(main())
