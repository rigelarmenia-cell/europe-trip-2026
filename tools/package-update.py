"""B6 delta against the actual published 7b32f0d archive. Never uploads."""
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED
from hashlib import sha256
root = Path(__file__).resolve().parent.parent
# Unpublished pre-existing dotfiles are outside this requested update.
names = ['index.html', 'styles.css', 'app.js', 'sw.js', 'manifest.webmanifest', 'trip.json', 'alerts.json', 'demo-trip.json', 'paths.json', 'package.json', 'README.md', 'STATE.md', 'lib', 'icons', 'vendor', 'docs', 'tests', 'tools']
files = {}
for name in names:
    path = root / name
    for item in (path.rglob('*') if path.is_dir() else [path]):
        if item.is_file() and '__pycache__' not in item.parts and not item.relative_to(root).as_posix().startswith('tests/fixtures/'):
            files[item.relative_to(root).as_posix()] = item.read_bytes()
commit = '7b32f0d12eaf8bb895512ea2f49c05c5450813fa'
assert (root / 'artifacts/b6-baseline-commit.txt').read_text().strip() == commit
with ZipFile(root / 'artifacts/b6-published-baseline.zip') as baseline:
    prefix = f'europe-trip-2026-{commit}/'
    assert all(name.startswith(prefix) for name in baseline.namelist())
    previous = {name[len(prefix):]: baseline.read(name) for name in baseline.namelist() if not name.endswith('/')}
assert sha256(files['trip.json']).hexdigest() == '9e4eba35f1924aedadb7cea58b1098381be1b328003a5c787781e4aa1cbee1c2'
assert files['trip.json'] == (root / 'artifacts/B52-upload/trip.json').read_bytes()
changed = {name: data for name, data in files.items() if previous.get(name) != data}
# The task explicitly requires the verified data even when identical to the live v14.
changed['trip.json'] = files['trip.json']
deleted = sorted(set(previous) - set(files))
assert not deleted, f'Unexpected removals: {deleted}'
target = root / 'europe-trip-2026-B6-update.zip'
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
