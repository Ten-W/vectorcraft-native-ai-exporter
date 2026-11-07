# Patched Windows exporter host

VectorCraft 0.21.0 discards image bytes >=8KiB from exporter input. The standalone runner resolves the complete saved-file tail.

`vectorcraft-inline-export-images.patch` inlines used image bytes in the host exporter JSON with the existing ABI and a 128MiB input budget. It applies to upstream v0.21.1, commit `f6aa4309b4e11a6844e156120560b4beabf17fe9`.

The Windows desktop app and CLI built successfully in CI run 42325346052. The downloaded executables passed a local synthetic 256×256 PNG regression in both CLI and the actual desktop control API. All 262144 RGBA bytes matched the source, including alpha. The test uses an isolated profile and closes only the desktop process it starts. Evidence and executable hashes are in `test/windows-host-large-image.json`.

Reproduce with `node probes/check-host-images.mjs PATH_TO_PATCHED_CLI PATH_TO_WASM --gui`. Run with the original CLI and `--expect-missing` to reproduce the original failure. The patch has not been submitted upstream. The test build is unsigned and the installed Program Files application has not been replaced. The desktop build uses the pinned upstream source and font assets identified in `.github/workflows/host-images.yml`.
