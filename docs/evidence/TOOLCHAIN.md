# REA 실행 환경 정비 기록

2026-11-14 · Codex가 수행. Kiro 실사용 또는 게임 분석 기록이 아님.

## 결과

- npm 공식 최신 REA: 6.9.0. 기존 소스 package 버전과 같아 더 높은 공개 버전은 확인되지 않았다.
- 이 프로젝트에 공식 배포본을 별도 설치: `.tools/rea-6.9.0/`.
- Node를 프로젝트 범위에서 26.11.0 → 26.13.1로 교체해 실행: `.tools/node-v26.13.1-darwin-arm64/`.
- 공식 Node 배포 체크섬과 다운로드 SHA-256 일치. [manifest](toolchain-manifest.json)에 URL·해시·npm integrity 기록.
- `scripts/rea.sh --version`: 6.9.0, exit 0.
- direct stdio initialize + tools/list: 성공, 255 tools. [MCP 결과](rea-mcp-preflight.json).
- `doctor`: Node/host 정상. 전체 환경은 미완성으로 exit 1. [요약](rea-doctor-summary.json).
- Ghidra는 현재 REA 환경에서 미설정. JDK·Ghidra 경로/버전 및 원본 DOS 실행은 G0/G1에서 확보해야 한다.
- Kiro에서 실제 MCP 연결: NOT RUN. Abuse 분석: NOT RUN.

## 수정 전 원인

기존 `/Users/men1692/Desktop/AI/rea`는 소스 checkout이며 HEAD는 `e8c838e8bd4fe46f06aaefea793fcc39b00b50de`였다. Node 26.11.0이 REA 요구 범위 밖이라 진입이 거부됐고, 지원 Node로 바꿔 실행했을 때도 필요한 compiled runtime이 누락돼 있었다.

공식 배포본은 `^22.23.4 || ^24.22.1 || >=26.12.1`을 요구했다. PATH의 Node 22.23.3은 요구 버전보다 낮고 simdjson 동적 라이브러리 오류도 있어 사용하지 않았다.

REA wrapper는 프로젝트 Node를 자식 프로세스 PATH 앞에 두고, 상속된 JAVA_HOME이 빈 문자열일 때만 자식에서 해제한다. 전역 shell 설정·Homebrew 기본 Node·다른 클라이언트 MCP 설정은 바꾸지 않았다.

기존 REA checkout의 두 untracked obj 디렉터리를 보존했다. 소스 checkout을 업데이트/빌드한 것처럼 기록하지 않는다. 이 프로젝트가 사용하는 도구 배포본을 별도로 준비했다.

## 사용

```bash
./scripts/rea.sh --version
./scripts/rea.sh doctor --json
```

두 번째 명령은 provider가 아직 없으므로 전체 healthy를 반환하지 않을 수 있다. Hopper/IDA/JADX 등 모든 provider를 설치할 필요는 없다. G1에 필요한 provider만 선정한다.

설치 중 npm이 Frida install script의 미승인을 알렸다. 이번에 승인하거나 실행하지 않았다. Frida 기반 동적 분석을 사용할 수 있다고 주장하지 않는다. DOS 분석 계획의 기준은 emulator+호환 정적 provider이며 Frida를 필수로 두지 않는다.

## 같은 Mac에서 복구할 때

현재 설치는 완료됐다. 아래는 `.tools`를 분실했을 때의 복구 절차이며 평소 반복하지 않는다.

1. manifest의 공식 Node URL에서 tar.gz와 SHASUMS256.txt를 다운로드한다.
2. SHA-256이 일치하는지 확인한 뒤 `.tools`에 압축 해제한다.
3. 아래 명령으로 버전이 고정된 REA를 설치한다. 새 major를 자동 선택하지 않는다.

```bash
PATH="$PWD/.tools/node-v26.13.1-darwin-arm64/bin:$PATH" \
  .tools/node-v26.13.1-darwin-arm64/bin/npm install \
  --prefix .tools/rea-6.9.0 --no-audit --no-fund --save-exact rea-agents@6.9.0
./scripts/rea.sh --version
```

`.tools`는 macOS arm64 전용이며 공개 앱 의존성이 아니다. 공개 저장소에는 제외하고 이 문서와 manifest를 남긴다. raw doctor는 로컬 경로가 포함돼 `.local.json`으로 보존하고 공개 후보에서는 제외한다.

공식 근거: [Node 배포](https://nodejs.org/dist/v26.13.1/) · [REA npm](https://www.npmjs.com/package/rea-agents) · [REA 저장소](https://github.com/morluto/rea).

## 2026-11-14 G1 추가 (Kiro)

| 도구 | 위치 | 확인 |
|---|---|---|
| DOSBox Staging 0.83.0 | `.tools/DOSBox Staging.app` | 공식 GitHub release dmg sha256 `d8a771adfb8010fa6b5f7fb5351abfba659273ad01c89f03675a92bdbdae8167`, `--version` |
| Ghidra 12.2 | `.tools/ghidra_12.2_PUBLIC` | 공식 release zip sha256 `2c2cd776db3c1f6a097ba418922378ac3649cadd5e844a6f5f088ae628a7be67` |
| Ghidra decompiler/sleigh (darwin arm64) | `…/Ghidra/Features/Decompiler/os/mac_arm_64/` | 배포본에 없음 → 동봉 소스 `make ghidra_opt sleigh_opt ARCH_TYPE="-arch arm64" ADDITIONAL_FLAGS="-mmacosx-version-min=11.0 -w"` (Apple clang 17). sha256 decompile `8f793c1f…7e99a`, sleigh `c876531e…bca3d` |
| Temurin JDK 25.0.5+8 | `.tools/jdk-25.0.5+8` | Adoptium API checksum `36dc14d7…b0e857` 일치. REA가 JDK 25+ 요구(JDK 21 거부 확인) |

- 실행점: `scripts/rea-env.sh <args>` (GHIDRA_INSTALL_DIR·JAVA_HOME 자식 한정). `scripts/rea-env.sh --mcp` stdio initialize+tools/list = 255 tools (direct, Kiro 아님).
- REA ghidra provider: 12.2 accepted ("verified build 12.1.4"). 원본 EXE는 dos-mz/MzLoader로 stub만 로딩, LE 미지원. 변환본 ELF로 분석.
- Kiro workspace MCP 등록: `.kiro/settings/mcp.json` 쓰기가 권한 규칙(kiro-scope)으로 차단. 아래를 사용자가 직접 추가해야 한다.

```json
{ "mcpServers": { "rea": { "command": "/Users/men1692/Desktop/AWS/Kiroween2026/scripts/rea-env.sh", "args": ["--mcp"], "disabled": false, "autoApprove": [] } } }
```

## 2026-11-14 G3 앱 도구 (Kiro)

- npm devDependencies (exact, `package-lock.json`): vite 8.3.8, typescript 7.0.2, @types/node 26.6.6, @playwright/test 1.65.1. 설치는 프로젝트 Node 26.13.1의 npm으로 수행.
- `fsevents@2.3.3` install script 미승인.
- 브라우저 스모크: 설치된 Google Chrome 157.0.8103.78 (channel `chrome`). Playwright headless shell(chromium-headless-shell v1255)은 rAF 0/s로 사용 불가, 삭제.
