#!/usr/bin/env python3

# To run this example, create a .env file in this directory with:
#   MESA_ORG=your-org
#   MESA_REPO=your-repo
#   MESA_API_KEY=your-mesa-key
#
# Then run:
#   uv run main.py

from __future__ import annotations

import asyncio
import os

from dotenv import load_dotenv
from mesa_sdk import Mesa, RepoConfig

from repl import tiny_bash_repl


def required_env(name: str) -> str:
    value = os.environ.get(name, "").strip()
    if not value:
        raise SystemExit(f"Error: ${name} not set.")
    return value


async def main() -> None:
    load_dotenv()

    org = required_env("MESA_ORG")
    repo = required_env("MESA_REPO")
    api_key = required_env("MESA_API_KEY")

    async with Mesa(api_key=api_key, org=org) as mesa:
        # The Mesa SDK's fs.mount() creates a virtual filesystem backed by
        # Mesa's cloud storage, with no clone or sandbox required.
        print(f"Connecting to {org}/{repo} via Mesa...")
        async with mesa.fs.mount(
            repos=[RepoConfig(repo, bookmark="main")],
            mode="rw",
        ) as mesa_fs:
            new_change_id: str = await mesa_fs.changes.new(repo, bookmark="main")

            print(f"Connected to {org}/{repo}.")
            print('Type "exit" or Ctrl+C to quit.')
            print()

            async def move_main_bookmark() -> None:
                await mesa.bookmarks.move(
                    repo=repo,
                    bookmark="main",
                    change_id=new_change_id,
                )

            # bash.exec() runs commands against the mounted virtual filesystem.
            bash = mesa_fs.bash(cwd=f"/{org}/{repo}")
            await tiny_bash_repl(bash, move_main_bookmark)

    print("Bye!")


if __name__ == "__main__":
    asyncio.run(main())
