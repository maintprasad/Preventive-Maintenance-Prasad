#!/usr/bin/env node
/**
 * check-css.js — Penjaga regresi CSS untuk layar sentuh (Android/iOS).
 *
 *   node tools/check-css.js
 *
 * Kasus nyata (Okt 2026): `body{overscroll-behavior-y:none}` membuat UI terasa freeze di HP karena
 * html + body sama-sama overflow-x:hidden → body ikut menjadi scroll container, dan 'none' memutus
 * gestur scroll ke halaman. Pemeriksaan ini gagal bila pola itu muncul lagi.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const css = fs.readFileSync(process.argv[2] || path.join(__dirname, '..', 'css', 'style.css'), 'utf8');
const problems = [];

// 1) komentar tidak boleh bersarang / menggantung (merusak aturan sesudahnya)
let depth = 0, i = 0;
while (i < css.length) {
  if (css.startsWith('/*', i)) { if (depth) problems.push('komentar bersarang di posisi ' + i); depth = 1; i += 2; }
  else if (css.startsWith('*/', i)) { depth = 0; i += 2; }
  else i++;
}
if (depth) problems.push('komentar tidak ditutup');

// 2) kurung kurawal seimbang (di luar komentar)
const bare = css.replace(/\/\*[\s\S]*?\*\//g, '');
const open = (bare.match(/{/g) || []).length, close = (bare.match(/}/g) || []).length;
if (open !== close) problems.push(`kurung kurawal tidak seimbang: { ${open} vs } ${close}`);

// 3) overscroll-behavior none/contain pada html/body (selain html{overscroll-behavior-y:none})
for (const m of bare.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
  const sel = m[1].trim(), decl = m[2];
  if (/overscroll-behavior/.test(decl) && /(^|,)\s*body\s*(,|$)/.test(sel)) problems.push(`overscroll-behavior di selector "${sel}" — memutus scroll di HP, pasang di html saja`);
}

if (problems.length) { console.error('CSS bermasalah:\n - ' + problems.join('\n - ')); process.exit(1); }
console.log('CSS aman: komentar & kurung seimbang, tidak ada overscroll-behavior di body.');
