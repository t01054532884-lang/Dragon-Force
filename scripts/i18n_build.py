"""영어 사전 만들기: 번역 묶음(en-*.json, {한국어: 영어})을 합쳐 src/i18n/en.ts로.
사용: py scripts/i18n_build.py <묶음 폴더>
- 자리({0},{1}…)가 원문과 번역에서 같은지 확인하고, 다르면 그 줄은 빼고 알려 준다.
- 기존 en.ts의 항목은 유지하고(사람이 고친 것 보존), 새 묶음 값으로 덮어쓴다."""
import json, glob, os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'src', 'i18n', 'en.ts')
src_dir = sys.argv[1]

cur = {}
if os.path.exists(OUT):
    txt = open(OUT, encoding='utf-8').read()
    m = re.search(r'=\s*(\{[\s\S]*\});?\s*$', txt)
    if m and m.group(1).strip() != '{}':
        cur = json.loads(m.group(1))

ph = re.compile(r'\{\d+\}')
bad = []
for f in sorted(glob.glob(os.path.join(src_dir, 'en-*.json'))):
    for k, v in json.load(open(f, encoding='utf-8')).items():
        if sorted(ph.findall(k)) != sorted(ph.findall(v)):
            bad.append((k, v))
            continue
        cur[k] = v

# 이어 붙인 문장 대비: 여러 줄 원문은 줄마다, 줄바꿈을 띄어쓰기로 바꾼 형태, 앞뒤 공백을 뺀 형태도 넣는다
extra = {}
for k, v in list(cur.items()):
    if k.strip() != k and k.strip():
        extra.setdefault(k.strip(), v.strip())
    if '\n' in k:
        kl = k.split('\n')
        vl = v.split('\n')
        if len(kl) == len(vl):
            for a, b in zip(kl, vl):
                if a.strip():
                    extra.setdefault(a.strip(), b.strip())
        extra.setdefault(' '.join(x.strip() for x in kl if x.strip()), ' '.join(x.strip() for x in vl if x.strip()))
for k, v in extra.items():
    if k not in cur and sorted(ph.findall(k)) == sorted(ph.findall(v)):
        cur[k] = v
body = json.dumps(dict(sorted(cur.items())), ensure_ascii=False, indent=1)
open(OUT, 'w', encoding='utf-8', newline='\n').write(
    '// 영어 사전(scripts/i18n_build.py가 만든다 — 손으로 고쳐도 됨). 한국어 원문 → 영어. {0},{1}… = 실행 중 들어가는 값\n'
    '/* eslint-disable */\n'
    f'export const EN: Record<string, string> = {body};\n'
)
print('entries', len(cur), 'skipped(placeholder mismatch)', len(bad))
for k, v in bad[:20]:
    print('  !', json.dumps(k, ensure_ascii=False), '->', json.dumps(v, ensure_ascii=False))
