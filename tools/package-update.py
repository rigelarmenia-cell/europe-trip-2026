"""B5 delta against the actual published 6ec63f4 archive. Never uploads."""
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED
from hashlib import sha256
root = Path(__file__).resolve().parent.parent
names = ['.gitignore', '.nojekyll', 'index.html', 'styles.css', 'app.js', 'sw.js', 'manifest.webmanifest', 'trip.json', 'demo-trip.json', 'paths.json', 'package.json', 'README.md', 'STATE.md', 'lib', 'icons', 'vendor', 'docs', 'tests', 'tools']
files = {}
for name in names:
    path = root / name
    for item in (path.rglob('*') if path.is_dir() else [path]):
        if item.is_file() and '__pycache__' not in item.parts and not item.relative_to(root).as_posix().startswith('tests/fixtures/'):
            files[item.relative_to(root).as_posix()] = item.read_bytes()
commit = '6ec63f437bde9c76caaf250a4843b5c5244b815b'
assert (root / 'artifacts/b5-baseline-commit.txt').read_text().strip() == commit
with ZipFile(root / 'artifacts/b5-published-baseline.zip') as baseline:
    prefix = f'europe-trip-2026-{commit}/'
    assert all(name.startswith(prefix) for name in baseline.namelist())
    previous = {name[len(prefix):]: baseline.read(name) for name in baseline.namelist() if not name.endswith('/')}
assert sha256(files['trip.json']).hexdigest() == '9ed7bd72ab9939a96884b8616629ccbbbc186bc896cd54275965c15c4c8e5c17'
changed = {name: data for name, data in files.items() if previous.get(name) != data}
# The task explicitly requires the verified data even when identical to the live v12.
changed['trip.json'] = files['trip.json']
deleted = sorted(set(previous) - set(files))
assert not deleted, f'Unexpected removals: {deleted}'
target = root / 'europe-trip-2026-B5-update.zip'
with ZipFile(target, 'w', ZIP_DEFLATED) as archive:
    for name, data in sorted(changed.items()):
        archive.writestr(name, data)
with ZipFile(target) as archive:
    assert archive.testzip() is None
    assert not any(name.startswith('tests/fixtures/') for name in archive.namelist())
    assert all(archive.read(name) == files[name] for name in archive.namelist())
    assert all(name == 'trip.json' or previous.get(name) != archive.read(name) for name in archive.namelist())
print(f'PASS: {len(changed)} changed/new files; 0 deleted; ZIP integrity and byte differences verified; {target.stat().st_size} bytes')
print('\n'.join(sorted(changed)))
