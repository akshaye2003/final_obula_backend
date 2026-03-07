#!/bin/sh
# Unset deprecated npm env config (devdir) that causes npm 11+ warnings
unset NPM_CONFIG_DEVDIR
exec npx vite "$@"
