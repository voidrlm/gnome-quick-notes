import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import Pango from 'gi://Pango';
import St from 'gi://St';

import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

const DATA_DIR = GLib.build_filenamev([GLib.get_user_data_dir(), 'quick-notes']);
const DATA_FILE = GLib.build_filenamev([DATA_DIR, 'notes.json']);
// Typing in the note is saved this long after the last keystroke.
const SAVE_DELAY_MS = 500;

function load() {
    try {
        const [, bytes] = GLib.file_get_contents(DATA_FILE);
        const d = JSON.parse(new TextDecoder().decode(bytes));
        return {
            todos: Array.isArray(d.todos) ? d.todos.filter(t => typeof t?.text === 'string') : [],
            note: typeof d.note === 'string' ? d.note : '',
        };
    } catch (e) {
        return {todos: [], note: ''};
    }
}

function save(data) {
    try {
        GLib.mkdir_with_parents(DATA_DIR, 0o755);
        GLib.file_set_contents(DATA_FILE, new TextEncoder().encode(JSON.stringify(data, null, 2)));
    } catch (e) {
        console.error(`quick-notes: could not save: ${e}`);
    }
}

function iconButton(iconName, styleClass, onClick) {
    const b = new St.Button({
        style_class: styleClass,
        child: new St.Icon({icon_name: iconName, icon_size: 16}),
        y_align: Clutter.ActorAlign.CENTER,
        can_focus: true,
    });
    b.connect('clicked', onClick);
    return b;
}

// Only the line of text inside an St.Entry takes clicks; make a click anywhere
// in the box focus it, with the cursor at the end.
function focusOnClick(entry) {
    entry.connect('button-press-event', () => {
        entry.clutter_text.grab_key_focus();
        entry.clutter_text.set_cursor_position(-1);
        return Clutter.EVENT_STOP;
    });
}

export default class QuickNotes extends Extension {
    enable() {
        this._data = load();

        this._button = new PanelMenu.Button(0.5, this.metadata.name);
        const box = new St.BoxLayout({style_class: 'qn-box'});
        box.add_child(new St.Icon({icon_name: 'view-list-bullet-symbolic', style_class: 'system-status-icon'}));
        this._count = new St.Label({style_class: 'qn-count', y_align: Clutter.ActorAlign.CENTER});
        box.add_child(this._count);
        this._button.add_child(box);

        const menu = this._button.menu;
        menu.box.add_style_class_name('qn-menu');
        menu.addMenuItem(this._buildTodos());
        menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        menu.addMenuItem(this._buildNote());
        menu.connect('open-state-changed', (m, open) => {
            if (!open) return;
            // Ready to type a task as soon as the menu opens.
            GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
                this._entry?.grab_key_focus();
                return GLib.SOURCE_REMOVE;
            });
        });

        Main.panel.addToStatusArea(this.uuid, this._button, 0, 'right');
        this._renderTodos();
    }

    _buildTodos() {
        const item = new PopupMenu.PopupBaseMenuItem({reactive: false, can_focus: false});
        const box = new St.BoxLayout({vertical: true, x_expand: true, style_class: 'qn-section'});

        const head = new St.BoxLayout({style_class: 'qn-head'});
        head.add_child(new St.Label({text: 'To-do', style_class: 'qn-title', x_expand: true, y_align: Clutter.ActorAlign.CENTER}));
        this._clearDone = new St.Button({label: 'Clear done', style_class: 'qn-link', y_align: Clutter.ActorAlign.CENTER});
        this._clearDone.connect('clicked', () => {
            this._data.todos = this._data.todos.filter(t => !t.done);
            this._changed();
        });
        head.add_child(this._clearDone);
        box.add_child(head);

        this._entry = new St.Entry({hint_text: 'Add a task and press Enter', style_class: 'qn-entry', can_focus: true, x_expand: true});
        focusOnClick(this._entry);
        this._entry.clutter_text.connect('activate', () => {
            const text = this._entry.text.trim();
            if (!text) return;
            this._data.todos.push({text, done: false});
            this._entry.text = '';
            this._changed();
        });
        box.add_child(this._entry);

        this._list = new St.BoxLayout({vertical: true, x_expand: true, style_class: 'qn-list'});
        box.add_child(new St.ScrollView({
            child: this._list,
            style_class: 'qn-scroll',
            hscrollbar_policy: St.PolicyType.NEVER,
            vscrollbar_policy: St.PolicyType.AUTOMATIC,
            overlay_scrollbars: true,
        }));
        this._empty = new St.Label({text: 'Nothing to do', style_class: 'qn-empty'});
        box.add_child(this._empty);

        item.add_child(box);
        return item;
    }

    _buildNote() {
        const item = new PopupMenu.PopupBaseMenuItem({reactive: false, can_focus: false});
        const box = new St.BoxLayout({vertical: true, x_expand: true, style_class: 'qn-section'});
        box.add_child(new St.Label({text: 'Notes', style_class: 'qn-title qn-head'}));

        this._note = new St.Entry({hint_text: 'Write anything…', style_class: 'qn-note', can_focus: true, x_expand: true});
        focusOnClick(this._note);
        const ct = this._note.clutter_text;
        // Multi-line: Enter inserts a newline instead of "activating".
        ct.single_line_mode = false;
        ct.activatable = false;
        ct.line_wrap = true;
        ct.line_wrap_mode = Pango.WrapMode.WORD_CHAR;
        this._note.text = this._data.note;
        ct.connect('text-changed', () => {
            this._data.note = ct.text;
            this._queueSave();
        });
        box.add_child(this._note);

        item.add_child(box);
        return item;
    }

    _row(todo) {
        const row = new St.BoxLayout({style_class: 'qn-row', reactive: true, track_hover: true, x_expand: true});
        row.add_child(iconButton(todo.done ? 'checkbox-checked-symbolic' : 'checkbox-symbolic', 'qn-check', () => {
            todo.done = !todo.done;
            this._changed();
        }));
        const label = new St.Label({style_class: todo.done ? 'qn-text done' : 'qn-text', x_expand: true, y_align: Clutter.ActorAlign.CENTER});
        label.clutter_text.line_wrap = true;
        label.clutter_text.ellipsize = Pango.EllipsizeMode.NONE;
        const text = GLib.markup_escape_text(todo.text, -1);
        label.clutter_text.set_markup(todo.done ? `<s>${text}</s>` : text);
        row.add_child(label);
        row.add_child(iconButton('window-close-symbolic', 'qn-del', () => {
            this._data.todos.splice(this._data.todos.indexOf(todo), 1);
            this._changed();
        }));
        return row;
    }

    _renderTodos() {
        this._list.destroy_all_children();
        // Open tasks first, finished ones sink to the bottom.
        const todos = [...this._data.todos.filter(t => !t.done), ...this._data.todos.filter(t => t.done)];
        for (const t of todos) this._list.add_child(this._row(t));
        const open = todos.filter(t => !t.done).length;
        this._empty.visible = todos.length === 0;
        this._clearDone.visible = open < todos.length;
        this._count.text = open ? `${open}` : '';
        this._count.visible = open > 0;
    }

    _changed() {
        save(this._data);
        // Rebuilt after the click that triggered this has finished, since it
        // destroys the button that was clicked.
        if (this._renderId) return;
        this._renderId = GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
            this._renderId = 0;
            this._renderTodos();
            return GLib.SOURCE_REMOVE;
        });
    }

    _queueSave() {
        if (this._saveId) GLib.source_remove(this._saveId);
        this._saveId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, SAVE_DELAY_MS, () => {
            this._saveId = 0;
            save(this._data);
            return GLib.SOURCE_REMOVE;
        });
    }

    disable() {
        if (this._saveId) {
            GLib.source_remove(this._saveId);
            this._saveId = 0;
            save(this._data);
        }
        if (this._renderId) {
            GLib.source_remove(this._renderId);
            this._renderId = 0;
        }
        this._button?.destroy();
        this._button = this._count = this._entry = this._list = this._empty = this._clearDone = this._note = null;
        this._data = null;
    }
}
