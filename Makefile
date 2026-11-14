# REANIMATOR gate. Uses the project-scoped Node (see docs/evidence/TOOLCHAIN.md).
NODE_BIN := $(CURDIR)/.tools/node-v26.13.1-darwin-arm64/bin
NODE := $(NODE_BIN)/node
# GNU Make 3.81 execs simple commands without the shell, so an exported PATH is not applied: use $(NODE) explicitly.

.PHONY: check typecheck test-engine reference-verify reference-holdout reach build dist-guard smoke-local

# Required gate: unit/boundary tests + development scenarios against original-run references.
# A missing/empty/corrupt reference is NOT RUN/ERROR and fails the gate (never a vacuous PASS).
check: typecheck test-engine reference-verify reach build dist-guard

# no original file may reach the public build
dist-guard: build
	$(NODE) tools/release/check-dist.ts

typecheck:
	$(NODE) node_modules/typescript/bin/tsc -p tsconfig.json

reach:
	$(NODE) tools/game/reach.ts
	$(NODE) tools/game/reach3d.ts

build:
	$(NODE) node_modules/vite/bin/vite.js build --logLevel warn

test-engine:
	$(NODE) --test tests/

reference-verify:
	$(NODE) tools/reference/verify.ts

# Judges the sealed holdout. Run once per engine revision; never use the result to tune the engine.
reference-holdout:
	$(NODE) tools/reference/verify.ts --holdout

smoke-local: build
	$(NODE) tools/smoke/smoke.ts
