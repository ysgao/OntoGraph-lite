# Quickstart: Standalone CLI Reasoner (Bundled Runtime)

Manual end-to-end verification steps once the feature is implemented. These map directly onto the
spec's acceptance scenarios and success criteria.

## Setup

1. `mvn clean package` in `java-server/` (unchanged build, produces the reasoner JAR this feature
   reuses as-is).
2. `node cli-standalone/scripts/fetch-runtime.mjs` then `pnpm --filter ontograph-cli-standalone
   build` — confirm `cli-standalone/dist/runtime/jre/Contents/Home/bin/java` and
   `cli-standalone/dist/runtime/onto-reasoner-server.jar` both exist afterward.
3. On a macOS Apple Silicon machine, ideally in a container/VM with **no system `java`
   installed** — `npm pack` the standalone package (or `npm link`) so it can be tested as it would
   actually be installed.

## Story 1 — Reasoning without VS Code

1. With VS Code fully closed, run `ontograph classify test-ontologies/animals.omn` (standalone
   package). Confirm a valid `ClassificationResult` — `consistent: true`, a non-empty `hierarchy`.
2. Run `ontograph check-consistency test-ontologies/animals.omn`. Confirm `consistent: true`.
3. Run `ontograph dl-query test-ontologies/animals.omn "Koala" --types directSuperClasses`.
   Confirm the same shape/behavior as feature 027's minimal-CLI `dl-query`.
4. Confirm none of the above ever attempted to connect to a bridge socket or reference a system
   `java` (check via process monitoring or by running in an environment with no `java` on `PATH`
   at all).

## Story 2 — Zero-dependency install

1. On a clean macOS arm64 environment with `java -version` failing (no Java installed anywhere),
   install the standalone package fresh.
2. Immediately run `ontograph classify <file>` with no other setup. Confirm success.
3. Confirm the install itself required no manual Java installation step.

## Story 3 — Minimal package unaffected

1. With VS Code running and OntoGraph active, run the minimal package's
   `ontograph classify`/`check-consistency`/`dl-query` (no file argument). Confirm behavior is
   identical to before this feature (re-run feature 027's own quickstart steps as a regression
   check).
2. Run `npm test`/`pnpm --filter ontograph-cli test` for the minimal package and confirm the exact
   same pass count as before this feature (no new failures, no new skips).

## Story 4 — Future command parity

1. (Design-time check, not a runtime scenario) Confirm `cli/src/main.ts` and
   `cli-standalone/src/main.ts` both call the same `registerCoreCommands()` function — grep for a
   second, independent `.command('parse ...')`-style registration; there should be none outside
   `registerCoreCommands.ts`.
2. Add a trivial new file-based command to `registerCoreCommands()` as a smoke test, rebuild both
   packages, and confirm the new command's `--help` text appears in both without any additional
   code in `cli-standalone/`.

## Edge cases to spot-check

- Rename/move `dist/runtime/jre/Contents/Home/bin/java` temporarily and confirm a `RUNTIME_UNAVAILABLE` error,
  not a hang or a raw Node stack trace.
- Attempt to run the standalone package's binary on a non-macOS-arm64 machine (or simulate via a
  build with an intentionally wrong `javaPath`) and confirm a clear `PLATFORM_UNSUPPORTED`-style
  message.
- Run standalone `classify` against `test-ontologies/anatomy.owl` (SNOMED CT scale) and confirm
  completion time is comparable to the minimal CLI's VS-Code-attached `classify` against the same
  file (spec SC-005).
- Run standalone `dl-query` with an invalid `--types` value and confirm it fails with
  `INVALID_ARGS` before ever spawning the bundled runtime (mirrors feature 027's SC-005).
