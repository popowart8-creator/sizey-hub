#!/usr/bin/env bash
set -euo pipefail
[[ $(id -u) == 0 ]] || { echo 'Run as root'; exit 1; }
test -f /var/www/sizey-hub/current/index.html
if ! id sizey-deploy >/dev/null 2>&1; then
  useradd --create-home --shell /bin/bash sizey-deploy
fi
[[ $(id -u sizey-deploy) != 0 ]]
install -d -m 755 -o sizey-deploy -g sizey-deploy /var/www/sizey-hub /var/www/sizey-hub/releases
install -d -m 700 /root/.ssh
if [[ ! -f /root/.ssh/sizey-github-actions ]]; then
  ssh-keygen -t ed25519 -N '' -C sizey-github-actions -f /root/.ssh/sizey-github-actions
fi
install -d -m 700 -o sizey-deploy -g sizey-deploy /home/sizey-deploy/.ssh
touch /home/sizey-deploy/.ssh/authorized_keys
pubkey=$(cat /root/.ssh/sizey-github-actions.pub)
if ! grep -qF "$pubkey" /home/sizey-deploy/.ssh/authorized_keys; then
  printf 'restrict %s\n' "$pubkey" >> /home/sizey-deploy/.ssh/authorized_keys
fi
chown sizey-deploy:sizey-deploy /home/sizey-deploy/.ssh/authorized_keys
chmod 600 /home/sizey-deploy/.ssh/authorized_keys
printf '\nSSH_KNOWN_HOSTS value:\n95.181.213.9 '
cat /etc/ssh/ssh_host_ed25519_key.pub
printf '\nReady. Private key stays at /root/.ssh/sizey-github-actions. Paste only into GitHub SSH_KEY secret, never into chat.\n'
