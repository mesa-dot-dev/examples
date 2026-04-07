#!/usr/bin/env node
import { RunloopSDK } from "@runloop/api-client";
import TinyRunloopRepl from "./tiny-runloop-repl.ts";

const ORG = "your-example-org";  // The org you want to use.
const MESA_API_KEY = process.env["MESA_API_KEY"] ?? (() => { throw Error("$MESA_API_KEY not set.") })();

const devbox = await (new RunloopSDK()).devbox.create({ name: `mesa-example-shell` });

try {
  // Set up mesa within the Runloop container.
  //
  // We recommend installing mesa as part of the container definition, but here we install it directly to keep the
  // example small.

  // You can install mesa as per the guide in https://docs.mesa.dev/content/virtual-filesystem/os-level.
  //
  // Mesa's installer will install all its dependencies through your system's package manager.
  await devbox.cmd.exec("curl -fsSL https://mesa.dev/install.sh | sh");

  // It is critical that you enable the user_allow_other flag in your fuse configuration.
  //
  // This allows users outside of yourself to also access the mesa mount you mounted. Mesa requires this for operation.
  // See https://www.man7.org/linux/man-pages/man8/mount.fuse3.8.html for more details.
  await devbox.cmd.exec("sudo sed -i 's/^#user_allow_other/user_allow_other/' /etc/fuse.conf");

  // Runloop does not allow changing the groups of any users, so you must allow everyone to access the fuse device.
  //
  // /dev/fuse is owned by root:fuse so normally you just add your user to the fuse group but unfortunately, runloop
  // doesn't allow that.
  await devbox.cmd.exec("sudo chmod 666 /dev/fuse");

  // You can run mesa in daemon mode to kick it off in the background.
  //
  // The flags we are using here are:
  //   -d,--daemonize       Spawns mesa in the background
  //   -y,--non-interactive Tells mesa to use the default values for all its configuration values. It will create a new
  //                        config file for you.
  //
  // We also pass the environment variable:
  //   MESA_ORGS=<org>:<api-key>,... Tells mesa to configure the given organization with the given API key.
  //                                 mesa will store this information in its configuration file. See
  //                                 https://docs.mesa.dev/content/reference/mesa-cli-configuration for more details.
  await devbox.cmd.exec(`MESA_ORGS=${ORG}:${MESA_API_KEY} mesa mount -d -y`);

  // You can now explore repos in your org. We've written a tiny REPL here you can use to explore the container.
  (new TinyRunloopRepl(devbox)).run();
} finally {
  // No matter what happens, let's make sure we close the devbox so we don't burn Runloop tokens!
  await devbox.shutdown();
}
