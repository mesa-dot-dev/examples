#!/usr/bin/env python3

# To run this example, create a .env file in this directory with:
#   MESA_REPO=your-repo
#   MESA_PRIVATE_KEY=your-signing-private-key
#
# Then run:
#   uv run main.py

from __future__ import annotations

import asyncio
import os

from dotenv import load_dotenv
from mesa_sdk import Mesa, repo

from repl import tiny_bash_repl


def required_env(name: str) -> str:
    value = os.environ.get(name, "").strip()
    if not value:
        raise SystemExit(f"Error: ${name} not set.")
    return value


async def main() -> None:
    load_dotenv()

    repo_name = required_env("MESA_REPO")
    private_key = required_env("MESA_PRIVATE_KEY")

    async with Mesa(private_key=private_key) as mesa:
        org = mesa.org.slug
        # The Mesa SDK's layout mount creates a virtual filesystem backed by
        # Mesa's cloud storage, with no clone or sandbox required.
        print(f"Connecting to {org}/{repo_name} via Mesa...")
        async with mesa.fs(
            layout={f"/{org}/{repo_name}": repo(repo_name, mode="rw", at={"bookmark": "main"})},
            authors=[{"name": "App Agent", "email": "agent@example.com"}],
        ).mount() as mesa_fs:
            new_change_id: str = await mesa_fs.changes.new(repo_name, bookmark="main")

            print(f"Connected to {org}/{repo_name}.")
            print('Type "exit" or Ctrl+C to quit.')
            print()

            async def move_main_bookmark() -> None:
                await mesa.bookmarks.move(
                    repo=repo_name,
                    bookmark="main",
                    change_id=new_change_id,
                )

            # bash.exec() runs commands against the mounted virtual filesystem.
            bash = mesa_fs.bash(cwd=f"/{org}/{repo_name}")
            await tiny_bash_repl(bash, move_main_bookmark)

    print("Bye!")


if __name__ == "__main__":
    asyncio.run(main())
