/* extension.js
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 *
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

/* exported init */

const GETTEXT_DOMAIN = 'activitywatch-status-extension';

const { Clutter, GLib, Gio, GObject, Soup, St } = imports.gi;

const ExtensionUtils = imports.misc.extensionUtils;
const Main = imports.ui.main;
const PanelMenu = imports.ui.panelMenu;
const PopupMenu = imports.ui.popupMenu;

const _ = ExtensionUtils.gettext;

const Indicator = GObject.registerClass(
class Indicator extends PanelMenu.Button {
    _init() {
        super._init(0.0, _('ActivityWatch status'));

        let box = new St.BoxLayout();

        box.add_child(new St.Icon({
            icon_name: 'emoji-recent-symbolic',
            style_class: 'system-status-icon',
        }));

        this._statusLabel = new St.Label({
            text: '?h ??m',
            y_align: Clutter.ActorAlign.CENTER,
        });
        box.add_child(this._statusLabel);
        this.add_child(box);

        this._status = new PopupMenu.PopupImageMenuItem(_('All fine'), 'view-refresh-symbolic');
        this._status.hide();
        this.menu.addMenuItem(this._status);

        /*
        this._totalStatus = new PopupMenu.PopupMenuItem(_('Active time today: ?h ??m'));
        this._totalStatus.set_can_focus(false);
        this._totalStatus.set_reactive(false);
        this.menu.addMenuItem(this._totalStatus);
        */

        let item = new PopupMenu.PopupMenuItem(_('Open ActivityWatch'));
        item.connect('activate', () => {
            Gio.AppInfo.launch_default_for_uri('http://localhost:5600', null);
            //Main.notify(_('Whatʼs up, folks?'));
        });
        this.menu.addMenuItem(item);
    }

    displayConnectionError(message) {
        this._status.label.set_text(message);
        this._status.show();
    }

    displayActivityTime() {
        this._status.hide();
    }

    setupStatusRefreshAction(extension) {
        this._status.connect('activate', () => {
            extension.fetchStatus();
        });
    }
});

class Extension {
    constructor(uuid) {
        this._uuid = uuid;

        ExtensionUtils.initTranslations(GETTEXT_DOMAIN);
    }

    enable() {
        this._indicator = new Indicator();
        Main.panel.addToStatusArea(this._uuid, this._indicator);
        this._indicator.setupStatusRefreshAction(this);

        this.fetchStatus();
        this._timeoutId = GLib.timeout_add_seconds(
            GLib.PRIORITY_DEFAULT, 30, () => {
                this.fetchStatus();
                return GLib.SOURCE_CONTINUE;
            }
        );
    }

    disable() {
        this._indicator.destroy();
        this._indicator = null;
        if (this._timeoutId) {
            GLib.Source.remove(this._timeoutId);
        }
    }

    fetchStatus() {
        let dayStart = new Date();
        dayStart.setHours(0);
        dayStart.setMinutes(0);
        dayStart.setSeconds(0);

        let dayEnd = new Date(dayStart);
        dayEnd.setDate(dayEnd.getDate() + 1);

        let body = {
            query: [
                'afk_events = query_bucket(find_bucket("aw-watcher-afk_"));',
                'events = filter_keyvals(afk_events, "status", ["not-afk"]);',
                'RETURN = sum_durations(events);'
            ],
            timeperiods: [
                dayStart.toISOString() + '/' + dayEnd.toISOString()
            ]
        };

        let message = Soup.Message.new(
            'POST',
            'http://localhost:5600/api/0/query/'
        );
        message.set_request_body_from_bytes(
            'application/json',
            GLib.Bytes.new(JSON.stringify(body))
        );

        let session = new Soup.Session();
        session.set_timeout(5);
        session.send_and_read_async(
            message,
            GLib.PRIORITY_DEFAULT,
            null,
            (session, result) => {
                this.retrieveStatus(session, result);
            }
        )
    }

    retrieveStatus(session, result) {
        let bytes;
        try {
            bytes = session.send_and_read_finish(result);
        } catch (e) {
            this.displayConnectionError();
            return;
        }
        let decoder = new TextDecoder('utf-8');
        let response = decoder.decode(bytes.get_data());
        let data = JSON.parse(response);
        if (typeof(data) != 'object' || !Array.isArray(data) || data.length != 1) {
            this.displayStatus('error');
            return;
        }

        let seconds = data[0];
        this.displayActivityTime(seconds);
    }

    displayConnectionError() {
        this.displayStatus(_('Error'), 'activity-connection-error');
        this._indicator.displayConnectionError(_('Error: ActivityWatch not running?'));
    }

    displayActivityTime(todayTotalSeconds) {
        this.displayStatus(this.formatSeconds(todayTotalSeconds), '');
        this._indicator.displayActivityTime();
    }

    displayStatus(message, style_class) {
        this._indicator._statusLabel.set_text(message);
        this._indicator._statusLabel.set_style_class_name(style_class);
    }

    formatSeconds(seconds) {
        seconds = parseInt(seconds);
        let minutes = parseInt(seconds / 60);
        let hours = parseInt(minutes / 60);
        minutes = minutes % 60;

        if (hours == 0) {
            return minutes + 'm';
        } else {
            return hours + "h " + ("" + minutes).padStart(2, '0') + 'm';
        }
    }
}

function init(meta) {
    return new Extension(meta.uuid);
}
