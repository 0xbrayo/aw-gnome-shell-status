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

import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import GObject from 'gi://GObject';
import Soup from 'gi://Soup?version=3.0';
import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';

const GETTEXT_DOMAIN = 'activitywatch-status-extension';

const Indicator = GObject.registerClass(
class Indicator extends PanelMenu.Button {
    _init() {
        super._init(0.0, 'ActivityWatch status');

        let box = new St.BoxLayout();

        box.add_child(new St.Icon({
            icon_name: 'emoji-recent-symbolic',
            style_class: 'system-status-icon aw-status-icon',
        }));

        this._statusLabel = new St.Label({
            text: '?h ??m',
            y_align: Clutter.ActorAlign.CENTER,
            style_class: 'aw-status-label'
        });
        box.add_child(this._statusLabel);
        this.add_child(box);

        this._status = new PopupMenu.PopupImageMenuItem('All fine', 'view-refresh-symbolic');
        this._status.hide();
        this.menu.addMenuItem(this._status);

        let item = new PopupMenu.PopupMenuItem('Open ActivityWatch');
        item.connect('activate', () => {
            Gio.AppInfo.launch_default_for_uri('http://localhost:5600', null);
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

export default class ActivityWatchExtension extends Extension {
    constructor(metadata) {
        super(metadata);
        this._hourlyCache = {};
        this._cacheDate = null;
        this._previousTotalSeconds = 0;
        this._logger = this.getLogger();
    }

    enable() {
        this._indicator = new Indicator();
        Main.panel.addToStatusArea(this.metadata.uuid, this._indicator);
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
        if (this._timeoutId) {
            GLib.Source.remove(this._timeoutId);
            this._timeoutId = null;
        }
        
        if (this._indicator) {
            this._indicator.destroy();
            this._indicator = null;
        }

        // Clear cache
        this._hourlyCache = {};
        this._cacheDate = null;
    }

    fetchStatus() {
        const now = new Date();
        const today = now.toDateString();
        const currentHour = now.getHours();
        
        // Clear cache if it's a new day
        if (this._cacheDate !== today) {
            this._hourlyCache = {};
            this._cacheDate = today;
        }

        // Start of day
        const dayStart = new Date(now);
        dayStart.setHours(0, 0, 0, 0);

        // Create array of promises for each uncached hour
        let promises = [];
        let hourlyData = [];
        
        for (let hour = 0; hour <= currentHour; hour++) {
            if (hour === currentHour || !this._hourlyCache[hour]) {
                // Query uncached or current hour
                const hourStart = new Date(dayStart);
                hourStart.setHours(hour);
                const hourEnd = new Date(hourStart);
                hourEnd.setHours(hour + 1);

                let body = {
                    query: [
                        'afk_events = query_bucket(find_bucket("aw-watcher-afk_"));',
                        'events = filter_keyvals(afk_events, "status", ["not-afk"]);',
                        'RETURN = sum_durations(events);'
                    ],
                    timeperiods: [
                        hourStart.toISOString() + '/' + hourEnd.toISOString()
                    ]
                };

                promises.push(
                    this.queryHour(body).then(seconds => {
                        // Cache the result unless it's the current hour
                        if (hour !== currentHour) {
                            this._hourlyCache[hour] = seconds;
                        }
                        hourlyData[hour] = seconds;
                    })
                );
            } else {
                // Use cached data
                hourlyData[hour] = this._hourlyCache[hour];
            }
        }

        // Wait for any uncached hours to be fetched
        Promise.all(promises)
            .then(() => {
                const totalSeconds = hourlyData.reduce((sum, seconds) => sum + (seconds || 0), 0);
                this.displayActivityTime(totalSeconds);
            })
            .catch(error => {
                this._logger.error('Error fetching data:', error);
                this.displayConnectionError();
            });
    }

    queryHour(body) {
        return new Promise((resolve, reject) => {
            try {
                const uri = GLib.Uri.parse('http://localhost:5600/api/0/query/', GLib.UriFlags.NONE);
                let message = Soup.Message.new_from_uri('POST', uri);
                
                const bytes = GLib.Bytes.new(JSON.stringify(body));
                message.set_request_body_from_bytes('application/json', bytes);

                let session = new Soup.Session();
                session.timeout = 5;

                session.send_and_read_async(
                    message,
                    GLib.PRIORITY_DEFAULT,
                    null,
                    (session, result) => {
                        try {
                            const bytes = session.send_and_read_finish(result);
                            if (!bytes) {
                                resolve(0);
                                return;
                            }

                            const decoder = new TextDecoder('utf-8');
                            const response = decoder.decode(bytes.get_data());
                            const data = JSON.parse(response);
                            
                            if (!Array.isArray(data) || data.length !== 1 || typeof data[0] !== 'number') {
                                this._logger.error('Invalid response format for hour');
                                resolve(0);
                                return;
                            }

                            resolve(data[0]);
                        } catch (error) {
                            this._logger.error('Error processing hour result:', error);
                            resolve(0);
                        }
                    }
                );
            } catch (error) {
                this._logger.error('Error querying hour:', error);
                resolve(0);
            }
        });
    }

    displayConnectionError() {
        this.displayStatus('Error', 'activity-connection-error');
        this._indicator.displayConnectionError('Error: ActivityWatch not running?');
    }

    displayActivityTime(todayTotalSeconds) {
        const isInactive = todayTotalSeconds <= this._previousTotalSeconds;
        const styleClass = isInactive ? 'activity-inactive' : '';
        this.displayStatus(this.formatSeconds(todayTotalSeconds), styleClass);
        this._indicator.displayActivityTime();
        
        // Update previous total for next comparison
        this._previousTotalSeconds = todayTotalSeconds;
    }

    displayStatus(message, style_class) {
        if (!this._indicator || !this._indicator._statusLabel) {
            return;
        }
        this._indicator._statusLabel.set_text(message);
        if (style_class) {
            this._indicator._statusLabel.set_style_class_name(style_class);
        } else {
            this._indicator._statusLabel.set_style_class_name('');
        }
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
