# pi-emacs

<!-- SPDX-License-Identifier: EPL-2.0 -->
<!-- Copyright © 2026-present Marko Kocic <marko@euptera.com> -->

A collection of Emacs-related extensions for pi-coding-agent.

## Installation

This package can be installed via npm:

```bash
pi install npm:pi-emacs
```

Or by adding it to your `~/.pi/settings.json`:

```json
{
  "packages": ["npm:markokocic/pi-emacs"]
}
```

## Extensions

### emacs_eval

Evaluates Emacs Lisp code via `emacsclient` CLI. Supports heredoc-style multi-line code input.

**Requires:** Emacs server running (`M-x server-start` in Emacs).

**Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `code` | string | Emacs Lisp code to evaluate |
| `timeout` | number (optional) | Timeout in seconds (default: 30) |
| `noWait` | boolean (optional) | Don't wait for response (fire and forget) |
| `quiet` | boolean (optional) | Suppress success messages |
| `socketName` | string (optional) | Emacs socket name |

**Returns:**
- `stdout` - Evaluation result from Emacs
- `stderr` - Standard error output
- `errors` - Any errors encountered
- `success` - Whether evaluation succeeded

**Example usage:**
```
;; Query Emacs version
(princ emacs-version)

;; Get current buffer name
(buffer-name (current-buffer))

;; Set a variable
(setq my-var "hello")

;; Query a variable
(message "%s" my-var)
```

## Development

```bash
# Link for local development
cd ~/.pi/agent/extensions
ln -s /path/to/pi-emacs/extensions ./pi-emacs

# Or reference in package.json
"pi": {
  "extensions": ["/path/to/pi-emacs/extensions/index.ts"]
}
```