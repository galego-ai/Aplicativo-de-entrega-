import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync("apps/cliente/EfiCardPayment.tsx", "utf8");
const compact = source.replace(/\s+/g, "");

test("tokenização Efí usa versão oficial fixada", () => {
  assert.match(source, /https:\/\/cdn\.jsdelivr\.net\/npm\/payment-token-efi@3\.4\.1\/dist\/payment-token-efi-umd\.min\.js/);
  assert.doesNotMatch(source, /cdn\.jsdelivr\.net\/gh\/efipay\/js-payment-token-efi/);
  assert.doesNotMatch(source, /payment-token-efi@(?:latest|next)/i);
});

test("WebView do cartão mantém navegação restrita e armazenamento compatível com a Efí", () => {
  assert.match(compact, /originWhitelist=\{\["about:blank"\]\}/);
  assert.match(compact, /javaScriptCanOpenWindowsAutomatically=\{false\}/);
  assert.match(source, /\bdomStorageEnabled\b/);
  assert.match(compact, /cacheEnabled=\{false\}/);
  assert.match(source, /\bthirdPartyCookiesEnabled\b/);
  assert.match(source, /\bsharedCookiesEnabled\b/);
  assert.match(compact, /mixedContentMode="never"/);
  assert.match(compact, /setSupportMultipleWindows=\{false\}/);
  assert.match(compact, /request=>request\.url==="about:blank"/);
  assert.doesNotMatch(compact, /domStorageEnabled=\{false\}/);
});

test("ponte WebView envia somente token e dados não sensíveis necessários", () => {
  const bridge = compact.match(/post\('token',\{([^;]+)\}\);el\('number'\)/)?.[1] ?? "";
  assert.ok(bridge, "Payload token não encontrado");
  assert.match(bridge, /paymentToken:token\.payment_token/);
  assert.match(bridge, /cardMask:token\.card_mask/);
  assert.match(bridge, /brand,installments/);
  assert.match(bridge, /customer:\{name,cpf,email,phone\}/);
  assert.doesNotMatch(bridge, /\bnumber\b/);
  assert.doesNotMatch(bridge, /\bcvv\b/);
  assert.doesNotMatch(bridge, /expirationMonth|expirationYear/);
});

test("número e CVV são apagados após tokenização", () => {
  assert.match(compact, /el\('number'\)\.value='';el\('cvv'\)\.value=''/);
});
