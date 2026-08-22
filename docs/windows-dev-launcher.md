# Language OS Dev launcher

The Language OS Dev launcher is a user-scoped Windows convenience layer for the canonical repository at `C:\Projects\Language OS`. It starts the existing `npm run dev` workflow without adding a desktop framework, service, or product runtime dependency.

## Daily use

Search Start for **Language OS Dev**. The main shortcut:

1. reuses a healthy Language OS server already listening on `http://localhost:3000/`;
2. checks the repository's pinned Node and npm versions;
3. runs `npm ci` when dependencies are absent or `package-lock.json` changed;
4. starts the development server in a hidden Windows PowerShell process;
5. waits for `/` and `/__debug` to respond; and
6. opens Language OS in Microsoft Edge app mode, with Chrome and the default browser as fallbacks.

Right-click the main Start shortcut and choose **Pin to taskbar** for one-click access. Windows does not allow installers to force taskbar pinning on the user's behalf.

The **Language OS Dev** Start folder also contains shortcuts to restart or stop the launcher-owned server, view its log, and uninstall the shortcuts. Restart and stop refuse to terminate an unknown process occupying port 3000.

## Runtime state

Launcher state is deliberately kept outside the repository:

```text
%LOCALAPPDATA%\Language OS Dev\
  LanguageOSDev.ico
  launcher.log
  package-lock.sha256
  server.json
  server.log
```

`server.json` records the hidden supervisor's PID and exact start time so a stale PID is not mistaken for an owned process. The launcher uses a per-user named mutex to prevent duplicate start/restart actions.

If startup fails, a Windows dialog includes the useful end of the server output and offers to open the complete log in Notepad. A non-Language-OS listener on port 3000 is reported and left untouched.

## Repository files

- `tools/windows/LanguageOSDev.ps1` owns open, restart, stop, health, process, browser, and logging behavior.
- `tools/windows/Install-LanguageOSDev.ps1` creates or removes user-level Start Menu shortcuts and generates their local icon.

These scripts do not modify Language OS product architecture, routes, persistence, hosting, or the Even G2 client.

