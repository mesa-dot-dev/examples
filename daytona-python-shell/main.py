#!/usr/bin/env python3

# To run this example, create a .env file in this directory with:
#   MESA_ORG=your-org
#   MESA_API_KEY=your-mesa-key
#   DAYTONA_API_KEY=your-daytona-key
#
# Then run:
#   uv run main.py

import os
from dotenv import load_dotenv
from daytona import Daytona

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
    # We also pass the environment variable:
    #   MESA_ORGS=<org>:<api-key>,... Tells mesa to configure the given organization with the given API key.
    #                                 Mesa will store this information in its configuration file. See
    #                                 https://docs.mesa.dev/content/reference/mesa-cli-configuration for more details.
    #
    # Note that mesa will write the orgs to the config file the first time it is booted up, so you do not need to
    # specify it again. When mesa is already configured, it will append the orgs given through the environment to the
    # ones in the config.toml.
    #
    # Additionally, we recommend creating and specifying an ephemeral key which persists for the lifetime of the sandbox,
    # rather than using the main API key. In the spirit of keeping this example small, we use the main API key. See
    # https://docs.mesa.dev/content/getting-started/auth-and-permissions for more details.
    print("Mounting Mesa...")
    sandbox.process.exec(f"MESA_ORGS={ORG}:{MESA_API_KEY} mesa mount -d -y")

    # You can now explore repos in your org. We've written a tiny REPL here you can use to explore the sandbox.
    # The default configuration is created in ~/.config/mesa/config.toml
    # and your files will be in ~/.local/share/mesa/mnt/<org>/<repo>
    tiny_daytona_repl(sandbox, cwd=f"~/.local/share/mesa/mnt/{ORG}")
finally:
    # No matter what happens, let's make sure we clean up the sandbox so we don't burn Daytona tokens!
    print("Cleaning up sandbox...")
    sandbox.delete()
    print("Bye!")
