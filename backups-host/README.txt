This folder is bind-mounted into the backend / worker / beat containers
at /mnt/host-backups. Backups land here when Settings → Backup →
"Backup folder path" is set to /mnt/host-backups in the UI.

Leave the Backup folder path empty in Settings to keep using the
default Docker volume at /data/backups (invisible from Windows
Explorer; download backups via the UI instead).

Files in this folder are gitignored — only this README is tracked.
