#!/bin/sh

set -eu

certutil -d sql:$HOME/.pki/nssdb -A -t "P,," -n testing -i /certs/server.crt
/opt/bin/entry_point.sh
