#!/bin/sh
set -eu

php83 artisan migrate --force
php83 artisan db:seed --class=YacDemoSeeder --force
php83 artisan optimize:clear

exec docker-entrypoint.sh
