"""src 안 한국어 문자열을 뽑아 번역 키로 만든다. 템플릿 `${...}`는 {0},{1}… 자리로.
결과: scratchpad/i18n/chunk-<n>.json (각 [{"k": 키, "f": 파일}]) — 5묶음."""
import re, glob, json, os, sys

OUT = sys.argv[1]
os.makedirs(OUT, exist_ok=True)
files = [f for f in glob.glob('src/**/*.ts', recursive=True) if '/dev/' not in f.replace('\\', '/') and 'gallery' not in f and 'i18n' not in f]
ko = re.compile('[가-힣]')


def scan(src):
    """문자열 리터럴을 차례로 돌려준다(주석 제외, 템플릿 중첩 단순 처리)."""
    i, n = 0, len(src)
    while i < n:
        c = src[i]
        if src.startswith('//', i):
            j = src.find('\n', i)
            i = n if j < 0 else j
            continue
        if src.startswith('/*', i):
            j = src.find('*/', i + 2)
            i = n if j < 0 else j + 2
            continue
        if c in '\'"':
            j = i + 1
            while j < n and src[j] != c and src[j] != '\n':
                j += 2 if src[j] == '\\' else 1
            yield ('s', src[i + 1:j])
            i = j + 1
            continue
        if c == '`':
            # 템플릿: ${ } 안은 중괄호 깊이로 건너뛴다
            j = i + 1
            parts = []
            buf = ''
            while j < n and src[j] != '`':
                if src[j] == '\\':
                    buf += src[j:j + 2]
                    j += 2
                    continue
                if src.startswith('${', j):
                    depth = 1
                    k = j + 2
                    while k < n and depth:
                        if src[k] == '{':
                            depth += 1
                        elif src[k] == '}':
                            depth -= 1
                        elif src[k] == '`':
                            # 안쪽 템플릿 건너뛰기
                            k2 = src.find('`', k + 1)
                            k = k2 if k2 > 0 else k
                        k += 1
                    parts.append(buf)
                    buf = ''
                    j = k
                    continue
                buf += src[j]
                j += 1
            parts.append(buf)
            yield ('t', parts)
            i = j + 1
            continue
        i += 1


keys = {}
for f in files:
    src = open(f, encoding='utf-8').read()
    for kind, v in scan(src):
        if kind == 's':
            if ko.search(v):
                keys.setdefault(v.replace('\\n', '\n'), f.replace('\\', '/'))
        else:
            joined = ''.join(v)
            if not ko.search(joined):
                continue
            key = ''
            for idx, p in enumerate(v):
                key += p
                if idx < len(v) - 1:
                    key += '{' + str(idx) + '}'
            keys.setdefault(key.replace('\\n', '\n'), f.replace('\\', '/'))

items = [{'k': k, 'f': f} for k, f in keys.items()]
items.sort(key=lambda x: (x['f'], x['k']))
N = 5
size = (len(items) + N - 1) // N
for c in range(N):
    json.dump(items[c * size:(c + 1) * size], open(os.path.join(OUT, f'chunk-{c + 1}.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=0)
print(len(items), 'keys', [len(items[c * size:(c + 1) * size]) for c in range(N)])
