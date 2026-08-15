# Bundled DSH CLI Design

## Context

DeepSeek Harness Desktop 0.2.0 only discovers a system-wide or cached `@deepseek-ai/dsh` installation. When no CLI is found, the app asks the user to launch through `npx`. This contradicts the desktop product's purpose: a non-technical user should be able to install the application and open it without first using a terminal.

The current `npx` fallback also exports `NODE_OPTIONS=--expose-internals`. A normal system Node process rejects that option and exits with code 9, producing the reported startup failure.

## Goals

- Ship official `@deepseek-ai/dsh` version `0.1.0-rc.6` inside every desktop installer.
- Start the bundled CLI with Electron's embedded Node runtime without invoking `npm`, `npx`, a login shell, or a system Node installation.
- Work offline after the application has been installed.
- Preserve the existing `~/.dsh` data directory and reuse an already-running DSH web service on the selected port.
- Keep `DSH_CLI` as an explicit developer override, while making the bundled CLI the default for every normal installation.
- Replace CLI-discovery failures with an installation-integrity error that tells the user to reinstall.
- Publish the change as desktop version `0.3.0` and update the public download page to remove the CLI prerequisite.

## Non-goals

- Automatically update the CLI independently of the desktop application.
- Install or modify the user's global npm packages.
- Solve Apple notarization or Windows Authenticode signing in this release.
- Change DSH account, model-provider, or API-key configuration behavior.

## Chosen Architecture

Add `@deepseek-ai/dsh` as an exact production dependency. Resolve its `lib/bin.js` entry from the installed package at runtime, then spawn `process.execPath` with `ELECTRON_RUN_AS_NODE=1` and pass `--expose-internals` as a process argument. Remove `NODE_OPTIONS` from the child environment so user or Electron environment values cannot recreate the reported failure.

The launch calculation will live in a small CommonJS module independent of Electron UI code. This makes resolution, argument construction, environment sanitation, and missing-package behavior testable without opening a desktop window. `main.js` remains responsible for process lifecycle, dialogs, readiness polling, and window management.

## Startup Flow

1. Probe `http://127.0.0.1:<port>` for the `__DSH_BOOT__` marker.
2. If a DSH service is already running, reuse it exactly as 0.2.0 does.
3. Otherwise resolve the CLI:
   - use `DSH_CLI` only when the environment variable explicitly points to an existing file;
   - otherwise resolve the bundled `@deepseek-ai/dsh/package.json` and derive `lib/bin.js` beside it.
4. Spawn Electron's executable in Node mode with:
   - `--expose-internals` as the first runtime argument;
   - the resolved CLI path;
   - `--profile web --port <port>`.
5. Set `DSH_HOME`, set `ELECTRON_RUN_AS_NODE=1`, and delete `NODE_OPTIONS` from the child environment.
6. Wait for readiness and load the local web UI.
7. If the bundled entry is absent or cannot be resolved, show a concise “installation is incomplete” dialog with reinstall guidance. Never offer `npx` or terminal commands.

## Packaging

- Pin `@deepseek-ai/dsh` to `0.1.0-rc.6` in `dependencies`, not `devDependencies`.
- Let electron-builder include the complete production dependency graph.
- Keep ASAR enabled. Explicitly unpack native `.node` files and the packaged ripgrep executable so DSH tools can load or execute them after installation.
- Keep architecture-specific builds for macOS x64/arm64 and Windows x64/arm64, plus Linux AppImage. CI remains the source of truth for non-host platforms because the DSH tree contains native optional dependencies such as `node-pty`, `sharp`, `koffi`, ripgrep, and `node-addon-require-builtin`.
- Verify each built application's resources contain the DSH entry and platform-native assets before publishing artifacts.

## Versioning and Updates

Desktop version `0.3.0` contains the exact CLI version `0.1.0-rc.6`. A future CLI upgrade requires a desktop release and its normal test/build cycle. The application performs no startup update check and makes no first-run download.

## Public Website and Documentation

The public download page will say that the installers include the required runtime and can launch without Node.js, npm, npx, or terminal preparation. The existing unsigned-app opening instructions remain directly beside the downloads because signing is still unresolved.

The workflow explanation and animated terminal text will describe starting the bundled service rather than discovering a cached CLI. README installation, architecture, environment variables, troubleshooting, and project disclaimer sections will be updated consistently. Internal signing guidance remains in `docs/SIGNING.md` and will not be promoted as customer-facing content.

## Testing

- Unit tests for bundled entry resolution, developer override validation, spawn arguments, port propagation, `DSH_HOME`, and `NODE_OPTIONS` removal.
- A regression test proving the default path never calls an `npx` fallback.
- Existing website installation-help tests plus new assertions for the no-prerequisite customer message.
- JavaScript syntax checks.
- Local development launch against the bundled dependency and HTTP verification of `__DSH_BOOT__`.
- A packaged macOS directory/app launch check on the current machine.
- GitHub Actions builds on macOS, Windows, and Linux; release publication only after every required build job succeeds.
- Live verification of the GitHub Release download URLs, the Cloudflare Pages project URL, and `https://dsh.chenshi.ai` when DNS is active.

## Release Sequence

1. Merge the tested changes into `main` through the repository's protected-branch workflow.
2. Tag `v0.3.0` on the merged commit and push the tag.
3. Wait for the tag build to finish and collect every installer artifact.
4. Create/update GitHub Release `v0.3.0` and upload the installers.
5. Deploy `site/` to the `dsh-desktop` Cloudflare Pages project from branch `main`.
6. Verify the live page, custom domain, and download links.

