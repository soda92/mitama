# Ghidra helpers for `mitama_dvd.exe`

The DVD executable is a PE32 i386 binary. Ghidra is used for:
- locating engine tables and command handlers;
- tracing script/scene loading (`LOD`, `TITLE`, `EVT`);
- recovering battle file/motion formats;
- identifying CG/event scene mappings.

The local executable is not committed. It is extracted into `.cache/dvd/`
or supplied through the original ISO.

## Import

```sh
/opt/ghidra/support/analyzeHeadless /tmp/mitama-ghidra mitama \
  -import .cache/dvd/mitama_dvd.exe \
  -analysisTimeoutPerFile 300
```

## Find string references

After the project exists, process the imported program and run the generic
reference finder:

```sh
/opt/ghidra/support/analyzeHeadless /tmp/mitama-ghidra mitama \
  -process mitama_dvd.exe \
  -scriptPath tools/ghidra \
  -postScript FindSceneRefs.java eyk2_03.txt yk2_03.txt TITLE
```

The script prints:
- every occurrence of the ASCII string;
- direct code xrefs to the string;
- 32-bit pointer-table entries that point at the string;
- direct xrefs to those pointer entries.

This is how the CG/event table at `0x49f68c` and the surrounding metadata at
`0x490400` were identified.

## Conventions

- Addresses in notes are **virtual addresses** (image base `0x400000`).
- `.text`: `0x401000..0x48e484`
- `.rdata`: `0x48f000..0x499d12`
- `.data`: `0x49a000..0x4a9000`
- The original DVD executable is 745 KB; do not add it to git.

## Persistent findings

Write durable conclusions in
[`docs/engine/reverse-engineering.md`](../../docs/engine/reverse-engineering.md),
not only in chat. Include the address, the function entry point, the
decompiler/C output, and how the conclusion was verified.
