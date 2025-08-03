#!/bin/sh

set -eu

cp -r /assets/* /usr/local/apache2/htdocs/

c2w-net --listen-ws --enable-tls --ws-cert /usr/local/apache2/conf/ssl/server.crt --ws-key /usr/local/apache2/conf/ssl/server.key 0.0.0.0:8888 &

httpd-foreground
