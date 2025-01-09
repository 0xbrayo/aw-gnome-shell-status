ActivityWatch status
====================

Gnome Shell extension that displays the total active time in the main panel,
as tracked by ActivityWatch__.

Needs a ActivityWatch instance running on http://localhost:5600/

__ https://activitywatch.net/


Manual installation
-------------------
Manually clone the repository in the right location::

  git clone https://github.com/0xbrayo/aw-gnome-shell-status
  cd aw-gnome-shell-status
  make install

Now restart gnome shell by logging off and in again (Wayland)
or Alt+F2 -> r -> Enter (X11).

Enable the extension::

  gnome-extensions enable aw-status@brayo.dev

Credits
-------
Initial version__ by Christian Weiske__.

__ https://codeberg.org/cweiske/activitywatch-status-gnome-shell.git
__ https://cweiske.de/