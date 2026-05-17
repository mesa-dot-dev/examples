"""A tiny REPL that executes bash commands against a Mesa virtual filesystem.

This is a minimal REPL and is not a full shell. It is intended as a
demonstration of how to interact with a Mesa repo programmatically via the
Python SDK's app-level virtual filesystem mount.
"""

from __future__ import annotations

import sys
from collections.abc import Awaitable, Callable

from mesa_sdk import Bash


async def tiny_bash_repl(
    bash: Bash,
    on_finish: Callable[[], Awaitable[None]],
) -> None:
    """Spawn an interactive REPL backed by a Mesa virtual filesystem."""
    while True:
        try:
            line = input("$ ")
        except (EOFError, KeyboardInterrupt):
            print()
            break

        command = line.strip()
        if not command:
            continue
        if command == "exit":
            break

        result = await bash.exec(command)
        await on_finish()

        if result.stdout:
            sys.stdout.buffer.write(result.stdout)
            sys.stdout.buffer.flush()
        if result.stderr:
            sys.stderr.buffer.write(result.stderr)
            sys.stderr.buffer.flush()

        if result.exit_code != 0:
            print(f"[exit {result.exit_code}]", file=sys.stderr)
