"""B5.2 (including B5.1) delta against the actual published 9157b00 archive. Never uploads."""
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED
from hashlib import sha256
root = Path(__file__).resolve().parent.parent
# Unpublished pre-existing dotfiles are outside this requested update.
names = ['index.html', 'styles.css', 'app.js', 'sw.js', 'manifest.webmanifest', 'trip.json', 'demo-trip.json', 'paths.json', 'package.json', 'README.md', 'STATE.md', 'lib', 'icons', 'vendor', 'docs', 'tests', 'tools']
files = {}
for name in names:
    path = root / name
    for item in (path.rglob('*') if path.is_dir() else [path]):
        if item.is_file() and '__pycache__' not in item.parts and not item.relative_to(root).as_posix().startswith('tests/fixtures/'):
            files[item.relative_to(root).as_posix()] = item.read_bytes()
commit = '9157b00ce032beebe3b983ca18fbc79a6cd38454'
assert (root / 'artifacts/b51-baseline-commit.txt').read_text().strip() == commit
with ZipFile(root / 'artifacts/b51-published-baseline.zip') as baseline:
    prefix = f'europe-trip-2026-{commit}/'
    assert all(name.startswith(prefix) for name in baseline.namelist())
    previous = {name[len(prefix):]: baseline.read(name) for name in baseline.namelist() if not name.endswith('/')}
assert sha256(files['trip.json']).hexdigest() == '9b11a7356a1091ab74bc39e3376bb1ad9ad4e90f59e290fe068cf0737a7b5f71'
assert files['trip.json'] == (root / 'artifacts/trip_v2026-10-18-13.json').read_bytes()
changed = {name: data for name, data in files.items() if previous.get(name) != data}
# The task explicitly requires the verified data even when identical to the live v13.
changed['trip.json'] = files['trip.json']
deleted = sorted(set(previous) - set(files))
assert deleted == ['icons/icon.svg'], f'Unexpected removals: {deleted}'
target = root / 'europe-trip-2026-B5-2-update.zip'
with ZipFile(target, 'w', ZIP_DEFLATED) as archive:
    for name, data in sorted(changed.items()):
        archive.writestr(name, data)
with ZipFile(target) as archive:
    assert archive.testzip() is None
    assert not any(name.startswith('tests/fixtures/') for name in archive.namelist())
    assert all(archive.read(name) == files[name] for name in archive.namelist())
    assert all(name == 'trip.json' or previous.get(name) != archive.read(name) for name in archive.namelist())
print(f'PASS: {len(changed)} changed/new files; {len(deleted)} deleted; ZIP integrity and byte differences verified; {target.stat().st_size} bytes')
print('\n'.join(sorted(changed)))
