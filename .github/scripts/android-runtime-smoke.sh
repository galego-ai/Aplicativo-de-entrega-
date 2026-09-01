#!/usr/bin/env bash
set -euo pipefail

PACKAGE_NAME="${1:?package obrigatório}"
APK_PATH="${2:?apk obrigatório}"
APP_NAME="${3:?app obrigatório}"
LOG_FILE="${APP_NAME}-logcat.txt"

echo "Instalando ${APK_PATH}"
test -f "${APK_PATH}"
adb install -r "${APK_PATH}"

adb logcat -c
adb shell monkey -p "${PACKAGE_NAME}" -c android.intent.category.LAUNCHER 1
sleep 20
adb logcat -d -v threadtime > "${LOG_FILE}"

PID="$(adb shell pidof "${PACKAGE_NAME}" | tr -d '\r' || true)"
echo "PID=${PID}"

if [[ -z "${PID}" ]]; then
  echo "APP_ENCERROU_INESPERADAMENTE"
  grep -n -E "FATAL EXCEPTION|AndroidRuntime|ReactNativeJS|SoLoader|UnsatisfiedLinkError|Invariant Violation|TypeError|ReferenceError|Invalid hook" "${LOG_FILE}" | tail -250 || true
  exit 1
fi

if grep -q "Process: ${PACKAGE_NAME}" "${LOG_FILE}" && grep -q "FATAL EXCEPTION" "${LOG_FILE}"; then
  echo "FATAL_EXCEPTION_DETECTADA"
  grep -n -E "FATAL EXCEPTION|AndroidRuntime|ReactNativeJS|SoLoader|UnsatisfiedLinkError|Invariant Violation|TypeError|ReferenceError|Invalid hook" "${LOG_FILE}" | tail -250 || true
  exit 1
fi

echo "APP_PERMANECEU_ATIVO"
grep -n -E "ReactNativeJS|AndroidRuntime|FATAL EXCEPTION|TypeError|ReferenceError|Invalid hook" "${LOG_FILE}" | tail -120 || true
