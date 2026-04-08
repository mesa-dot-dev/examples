"""A tiny REPL that executes commands inside a Daytona sandbox.

This is a minimal REPL and is not a full shell — it has an incredibly limited subset of regular shell commands.
It is intended as a demonstration of how to interact with a Daytona sandbox programmatically.
"""

from __future__ import annotations

import posixpath
import sys

from daytona import Sandbox


def _expand_tilde(path: str, homedir: str) -> str:
    """Expand a leading ~ to the sandbox's home directory."""
    if path.startswith("~"):
        return posixpath.join(homedir, path[1:].lstrip("/"))
    return path


class ShellState:
    """Tracks the current working directory across commands."""

    def __init__(self, sandbox: Sandbox, homedir: str, cwd: str) -> None:
        self._sandbox = sandbox
        self._homedir = homedir
        self._cwd = cwd

    def run(self, cmd: str) -> tuple[int, str] | None:
        """Execute a shell command. Handles ``cd`` gracefully enough."""
        trimmed = cmd.strip()
        if not trimmed:
            return None

        parts = trimmed.split()
        if parts[0] == "cd":
            target = parts[1] if len(parts) > 1 else "~"
            target = _expand_tilde(target, self._homedir)
            if posixpath.isabs(target):
                self._cwd = target
            else:
                self._cwd = posixpath.join(self._cwd, target)
            return None

        result = self._sandbox.process.exec(f"cd {self._cwd} && {trimmed}")
        return (result.exit_code, result.result or "")


def tiny_daytona_repl(sandbox: Sandbox, *, cwd: str | None = None) -> None:
    """Spawn the REPL so that users can explore the sandbox interactively.

    Args:
        sandbox: The Daytona sandbox to execute commands in.
        cwd: The initial working directory inside the sandbox.
    """
    homedir = sandbox.process.exec("echo $HOME").result.strip()
    initial_cwd = _expand_tilde(cwd or "~", homedir)
    shell = ShellState(sandbox, homedir, initial_cwd)

    while True:
        try:
            line = input("$ ")
        except (EOFError, KeyboardInterrupt):
            # Ctrl+D or Ctrl+C — exit gracefully.
            print()
            break

        trimmed = line.strip()
        if not trimmed:
            continue
        if trimmed == "exit":
            break

        res = shell.run(trimmed)
        if res is None:
            continue

        exit_code, output = res

        if output:
            # Normalize the output to always end with a newline
            sys.stdout.write(output.removesuffix("\n") + "\n")

        if exit_code != 0:
            print(f"[exit {exit_code}]", file=sys.stderr)
