# Quick Notes for GNOME

A GNOME Shell extension that puts a to-do list and a scratch note in a top-bar dropdown. Everything is saved automatically.

- Type a task and press Enter to add it
- Tick the checkbox to finish it; finished tasks move to the bottom
- Hover a task and click × to delete it, or use "Clear done"
- The panel icon shows how many tasks are still open
- The Notes box is free text; Enter starts a new line

Data is stored in `~/.local/share/quick-notes/notes.json`.

Requires GNOME Shell 50.

## Install

```bash
git clone https://github.com/voidrlm/gnome-quick-notes.git ~/.local/share/gnome-shell/extensions/quick-notes@arjun
```

Log out and back in, then enable it:

```bash
gnome-extensions enable quick-notes@arjun
```

## Update

```bash
git -C ~/.local/share/gnome-shell/extensions/quick-notes@arjun pull
```

Then log out and back in.
