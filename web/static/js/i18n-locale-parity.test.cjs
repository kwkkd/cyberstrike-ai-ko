const fs = require('node:fs');
const test = require('node:test');
const assert = require('node:assert/strict');

/* ko-KR 必须与 en-US 保持同一把钥匙：任何只加在英文里的键都会让韩文页面
   露出 i18n key（i18next 找不到就回退到 key），这是最容易被忽略的回归。
   其余既有语言包历史上有少量复数键差异，这里只把新语言锁死在英文基准上。 */

const en = JSON.parse(fs.readFileSync('web/static/i18n/en-US.json', 'utf8'));
const ko = JSON.parse(fs.readFileSync('web/static/i18n/ko-KR.json', 'utf8'));
const LOCALES = ['ko-KR', 'en-US', 'zh-CN', 'ru-RU'];
const dicts = Object.fromEntries(LOCALES.map(locale => [
    locale,
    JSON.parse(fs.readFileSync(`web/static/i18n/${locale}.json`, 'utf8')),
]));

function flatKeys(node, prefix, out) {
    if (node && typeof node === 'object' && !Array.isArray(node)) {
        Object.keys(node).forEach(key => flatKeys(node[key], prefix ? prefix + '.' + key : key, out));
    } else {
        out.add(prefix);
    }
    return out;
}

function resolve(node, dotted) {
    return dotted.split('.').reduce((acc, part) => (acc && typeof acc === 'object' ? acc[part] : undefined), node);
}

const enKeys = flatKeys(en, '', new Set());
const koKeys = flatKeys(ko, '', new Set());

test('ko-KR exposes exactly the same key tree as en-US', () => {
    const missing = [...enKeys].filter(key => !koKeys.has(key));
    const extra = [...koKeys].filter(key => !enKeys.has(key));
    assert.deepEqual(missing, [], `ko-KR is missing keys: ${missing.slice(0, 10).join(', ')}`);
    assert.deepEqual(extra, [], `ko-KR has keys other locales do not: ${extra.slice(0, 10).join(', ')}`);
});

test('ko-KR keeps i18next placeholders intact', () => {
    const pattern = /\{\{[^{}]*\}\}|%[sdvqfx]|\$\{[^{}]*\}|\{[A-Za-z_][\w.]*\}/g;
    const sorted = value => (String(value).match(pattern) || []).sort();
    enKeys.forEach(key => {
        const source = resolve(en, key);
        if (typeof source !== 'string') return;
        const expected = sorted(source);
        const value = resolve(ko, key);
        if (typeof value !== 'string') return;
        assert.deepEqual(sorted(value), expected, `ko-KR.${key} changed placeholders: ${value}`);
    });
});

test('ko-KR carries no Chinese text outside the language labels', () => {
    const cjk = /[\u4e00-\u9fff]/;
    koKeys.forEach(key => {
        if (key === 'lang.zhCN') return;
        const value = resolve(ko, key);
        if (typeof value !== 'string') return;
        assert.ok(!cjk.test(value), `ko-KR still has Chinese at ${key}: ${value}`);
    });
});

test('ko-KR translates tool calls as calls, not telephone calls', () => {
    const offenders = [];
    koKeys.forEach(key => {
        const value = resolve(ko, key);
        if (typeof value === 'string' && /(?:전화|통화)/.test(value)) {
            offenders.push(`${key}: ${value}`);
        }
    });
    assert.deepEqual(offenders, [], `tool-call mistranslations: ${offenders.slice(0, 10).join(' | ')}`);
});

test('every locale advertises Korean as a switchable language', () => {
    LOCALES.forEach(locale => {
        assert.equal(dicts[locale].lang.koKR, '한국어', `${locale} is missing the Korean language label`);
    });
});
