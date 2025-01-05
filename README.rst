ActivityWatch status
====================

Gnome Shell extension that displays the total active time in the main panel,
as tracked by ActivityWatch__.

Needs a ActivityWatch instance running on http://localhost:5600/

__ https://activitywatch.net/


Manual installation
-------------------
Manually clone the repository in the right location::

  git clone https://codeberg.org/cweiske/activitywatch-status-gnome-shell.git
  cd activitywatch-status-gnome-shell
  make install

Now restart gnome shell by logging off and in again (Wayland)
or Alt+F2 -> r -> Enter (X11).

Enable the extension::

  gnome-extensions enable activitywatch-status@cweiske.de
