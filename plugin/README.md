# Native AI WASM exporter

Build from the repository root (Node.js and Rust with wasm32-unknown-unknown):

```
node plugin/generate-templates.mjs
rustup target add wasm32-unknown-unknown
cargo build --locked --manifest-path plugin/Cargo.toml --release --target wasm32-unknown-unknown
node plugin/test-plugin.mjs plugin/target/wasm32-unknown-unknown/release/vectorcraft_native_ai.wasm
```

Release ZIPs also contain dependency sources/licenses in vendor. To use those offline, add `--config plugin/vendor-config.toml --offline` to the Cargo command while running from the repository root.

No WASI/host imports. ABI v1, exporter id tenw.native-ai. See the root README for tested scope, PNG/blob limitation, standalone runner, licensing and Illustrator acceptance evidence. A successful WASM unit test alone is not Illustrator validation.

The Chinese manifest declares no parameters, so normal export skips the settings dialog. Explicit font mappings remain available in the standalone runner. ABI v1 supplies neither the UI locale nor a font directory/API to the module, so this is a Chinese interface, not automatic locale detection.

`native/font-map.json` is a shared name-only catalog for the JS and WASM writers. It was extracted with the existing fontkit development dependency from VectorCraft's bundled fonts (Source Sans 3, Source Serif 4, Inter, JetBrains Mono, upstream `assets/fonts/`) and common Windows fonts (Arial, Microsoft YaHei, SimSun, SimHei, FangSong, KaiTi, Calibri, Segoe UI, Tahoma, Times New Roman, Verdana, Courier New). No font programs are shipped. Regenerate from those font files with `node plugin/generate-font-map.mjs font1.ttf font2.ttc ...`; conflicting names are omitted. This catalog identifies exact font names, not installation status on the recipient's computer. Unsupported fonts still fail rather than being substituted. A host font metadata interface is needed for arbitrary installed-font discovery inside the sandbox.

The nine bundled-font glyph coverage tables can be regenerated with `node plugin/generate-font-map.mjs --coverage <the nine bundled TTF files>`. They contain Unicode intervals only, not font programs. Unknown fonts outside this exact catalog are checked against local files by the standalone runner; the sandbox cannot enumerate the recipient computer.
