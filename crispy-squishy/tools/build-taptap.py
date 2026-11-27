#!/usr/bin/env python3
"""Build the TapTap H5 package for 脆皮捏捏铺.

    python3 crispy-squishy/tools/build-taptap.py                  # dist/taptap/crispy-h5-V1.0.0.zip
    python3 crispy-squishy/tools/build-taptap.py --version 1.0.1

TapTap wants one ASCII-named folder at the zip root with index.html directly inside it.
The game is a single self-contained file, so the package is that file plus a version stamp.
The build refuses to package anything that would reach out to the network.
"""
import argparse, json, re, shutil, sys, zipfile
from pathlib import Path

GAME = Path(__file__).resolve().parent.parent          # crispy-squishy/
REPO = GAME.parent
FOLDER = 'crispy'
LIMIT = 20 * 1024 * 1024


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--version', default='1.0.0')
    args = ap.parse_args()
    if not re.fullmatch(r'\d+\.\d+\.\d+', args.version):
        sys.exit('version must look like 1.0.0')

    html = (GAME / 'index.html').read_text('utf8')
    # Players in mainland China cannot reach most foreign hosts, and review rejects stray links.
    remote = sorted(set(re.findall(r'''(?:src|href)\s*=\s*["'](https?://[^"']+)''', html)) | set(re.findall(r'''url\(\s*["']?(https?://[^"')]+)''', html)))
    if remote:
        sys.exit('index.html loads remote files:\n  ' + '\n  '.join(remote))
    for word in ('fetch(', 'XMLHttpRequest', 'WebSocket(', 'sendBeacon'):
        if word in html:
            sys.exit(f'index.html talks to the network ({word})')

    out_dir = REPO / 'dist/taptap'
    stage = out_dir / FOLDER
    shutil.rmtree(stage, ignore_errors=True)
    stage.mkdir(parents=True)
    (stage / 'index.html').write_text(html, 'utf8')
    (stage / 'version.json').write_text(json.dumps({'version': args.version}) + '\n', 'utf8')

    zip_path = out_dir / f'crispy-h5-V{args.version}.zip'
    zip_path.unlink(missing_ok=True)
    packed = sorted(p for p in stage.rglob('*') if p.is_file())
    with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED, compresslevel=9) as z:
        for p in packed:
            z.write(p, p.relative_to(out_dir).as_posix())
    with zipfile.ZipFile(zip_path) as z:
        tops = {n.split('/')[0] for n in z.namelist()}
        assert tops == {FOLDER} and f'{FOLDER}/index.html' in z.namelist(), tops

    kb = lambda n: f'{n / 1024:.0f}KB'
    print(f'TapTap H5 V{args.version}  ->  {zip_path.relative_to(REPO)}')
    for p in packed:
        print(f'  {p.relative_to(stage).as_posix():<16}{kb(p.stat().st_size):>8}')
    print(f'  zip {kb(zip_path.stat().st_size)}')
    if zip_path.stat().st_size > LIMIT:
        sys.exit('package is over 20MB')
    if "const AD_UNIT_ID = '';" in html:
        print('  note: AD_UNIT_ID is empty, so this build shows the stand-in ad instead of real ads')


if __name__ == '__main__':
    main()
