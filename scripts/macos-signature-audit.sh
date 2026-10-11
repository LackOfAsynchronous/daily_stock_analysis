#!/usr/bin/env bash
set -euo pipefail

usage() {
  echo "Usage: $0 <normalize|check|adhoc> <artifact-path>" >&2
}

mode="${1:-}"
artifact_root="${2:-}"

if [[ "${mode}" != "normalize" ]] && [[ "${mode}" != "check" ]] && [[ "${mode}" != "adhoc" ]]; then
  usage
  exit 2
fi
if [[ -z "${artifact_root}" ]] || [[ ! -e "${artifact_root}" ]]; then
  echo "ERROR: macOS signature audit target does not exist: ${artifact_root:-<empty>}" >&2
  exit 2
fi
if ! command -v codesign >/dev/null 2>&1; then
  echo "ERROR: codesign is required for macOS signature auditing." >&2
  exit 2
fi
if ! command -v file >/dev/null 2>&1; then
  echo "ERROR: file is required for macOS signature auditing." >&2
  exit 2
fi

# Apple Silicon requires valid signatures on executable code, including dylibs
# in PyInstaller's resource tree that codesign --deep does not visit.
if [[ "${mode}" == "adhoc" ]]; then
  python3 - "${artifact_root}" <<'PY_SIGN'
import subprocess
import sys
from pathlib import Path

root = Path(sys.argv[1]).resolve()
magic_numbers = {
    bytes.fromhex(value) for value in (
        "feedface", "cefaedfe", "feedfacf", "cffaedfe",
        "cafebabe", "bebafeca", "cafebabf", "bfbafeca",
    )
}
count = 0
# Sign nested code before its containing bundle. Electron x64 ships with
# unsigned frameworks; signing the main executable first validates them too soon.
candidates = [root] if root.is_file() else sorted(root.rglob("*"), key=lambda p: len(p.parts), reverse=True)
for candidate in candidates:
    if root.suffix == ".app" and candidate.parent == root / "Contents" / "MacOS":
        continue  # The final --deep operation signs the outer app executable.
    if candidate.is_symlink() or not candidate.is_file():
        continue
    with candidate.open("rb") as handle:
        is_macho = handle.read(4) in magic_numbers
    if not is_macho:
        continue
    subprocess.run(["codesign", "--force", "--sign", "-", str(candidate)], check=True)
    count += 1
if root.suffix == ".app":
    subprocess.run(["codesign", "--force", "--deep", "--sign", "-", str(root)], check=True)
    subprocess.run(["codesign", "--verify", "--deep", "--strict", str(root)], check=True)
print(f"macOS ad-hoc signing complete: signed={count}")
PY_SIGN
  exit 0
fi

checked_count=0
signed_count=0
removed_count=0

remove_broken_signature() {
  local candidate="$1"
  local signature_details=""

  echo "WARNING: removing invalid signature from unsigned macOS artifact: ${candidate}"
  codesign --remove-signature "${candidate}"
  removed_count=$((removed_count + 1))

  signature_details="$(codesign -d "${candidate}" 2>&1 || true)"
  if [[ "${signature_details}" != *"code object is not signed at all"* ]]; then
    echo "ERROR: failed to remove invalid signature: ${candidate}" >&2
    echo "${signature_details}" >&2
    exit 1
  fi
}

audit_candidate() {
  local candidate="$1"
  local signature_details=""

  checked_count=$((checked_count + 1))
  if ! signature_details="$(codesign -d "${candidate}" 2>&1)"; then
    if [[ "${signature_details}" == *"code object is not signed at all"* ]]; then
      return 0
    fi
    if [[ "${mode}" == "normalize" ]]; then
      remove_broken_signature "${candidate}"
      return 0
    fi
    echo "ERROR: unreadable or invalid signature in macOS artifact: ${candidate}" >&2
    echo "${signature_details}" >&2
    exit 1
  fi

  signed_count=$((signed_count + 1))
  if codesign --verify --strict --verbose=4 "${candidate}" >/dev/null 2>&1; then
    return 0
  fi

  if [[ "${mode}" == "normalize" ]]; then
    remove_broken_signature "${candidate}"
    return 0
  fi

  echo "ERROR: invalid signature in macOS artifact: ${candidate}" >&2
  codesign --verify --strict --verbose=4 "${candidate}" || true
  exit 1
}

while IFS= read -r -d '' candidate; do
  if [[ -d "${candidate}" ]]; then
    audit_candidate "${candidate}"
  elif file -b "${candidate}" | grep -q "Mach-O"; then
    audit_candidate "${candidate}"
  fi
done < <(
  find "${artifact_root}" -depth \
    \( -type f -o -type d \( -name "*.app" -o -name "*.framework" -o -name "*.xpc" \) \) \
    -print0
)

echo "macOS signature audit complete: mode=${mode}, checked=${checked_count}, signed=${signed_count}, removed=${removed_count}"
