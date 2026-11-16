# REANIMATOR gate. Uses the project-scoped Node (see docs/evidence/TOOLCHAIN.md).
NODE_BIN := $(CURDIR)/.tools/node-v26.13.1-darwin-arm64/bin
NODE := $(NODE_BIN)/node
# GNU Make 3.81 execs simple commands without the shell, so an exported PATH is not applied: use $(NODE) explicitly.

.PHONY: check typecheck test-engine reference-verify reference-holdout reach difficulty build dist-guard smoke-local meshy-terrain release smoke-build

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

# Reckless-input difficulty probe (informational, not part of check)
difficulty:
	$(NODE) tools/game/difficulty.ts

build:
	$(NODE) node_modules/vite/bin/vite.js build --logLevel warn

test-engine:
	$(NODE) --test tests/

reference-verify:
	$(NODE) tools/reference/verify.ts

# Judges the sealed holdout. Run once per engine revision; never use the result to tune the engine.
reference-holdout:
	$(NODE) tools/reference/verify.ts --holdout

# Smoke/capture tooling needs the ?debug=1 hooks, which a shipped build never contains. This build goes to dist-debug/ (never released).
smoke-build:
	VITE_DEBUG_HOOKS=1 $(NODE) node_modules/vite/bin/vite.js build --logLevel warn --outDir dist-debug --emptyOutDir

smoke-local: smoke-build
	$(NODE) tools/smoke/smoke.ts

# Needs network + MESHY_API_KEY in .env. Resumable. Add ARGS=--dry-run to preview.
meshy-terrain:
	$(NODE) tools/meshy/terrain-kit.ts $(ARGS)

# Player-facing web build: gate, then zip dist/ with a player README, licences and changelog.
VERSION := $(shell $(NODE) -p "require('./package.json').version" 2>/dev/null)
release: check
	rm -rf release/stage && mkdir -p release/stage
	cp -R dist/. release/stage/
	cp tools/release/pack/PLAYER_README.txt release/stage/README.txt
	cp tools/release/pack/LICENSES.txt release/stage/LICENSES.txt
	cp CHANGELOG.md release/stage/CHANGELOG.md
	rm -f release/reanimator-$(VERSION)-web.zip
	cd release/stage && zip -qr ../reanimator-$(VERSION)-web.zip .
	rm -rf release/stage
	@ls -l release/reanimator-$(VERSION)-web.zip
