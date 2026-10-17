"""Combined B4.1+B4.2+B4.3 delta against delivered B1+B2+B3+B4. Keep baselines intact."""
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED
root = Path(__file__).resolve().parent.parent
names = ['.gitignore', '.nojekyll', 'index.html', 'styles.css', 'app.js', 'sw.js', 'manifest.webmanifest', 'trip.json', 'demo-trip.json', 'paths.json', 'package.json', 'README.md', 'STATE.md', 'lib', 'icons', 'vendor', 'docs', 'tests', 'tools']
files = {}
for name in names:
    path = root / name
    for item in (path.rglob('*') if path.is_dir() else [path]):
        if item.is_file() and '__pycache__' not in item.parts and not item.relative_to(root).as_posix().startswith('tests/fixtures/'):
            files[item.relative_to(root).as_posix()] = item.read_bytes()
with ZipFile(root / 'europe-trip-2026.zip') as baseline:
    previous = {name: baseline.read(name) for name in baseline.namelist() if not name.endswith('/')}
with ZipFile(root / 'europe-trip-2026-B2-update.zip') as baseline:
    previous.update({name: baseline.read(name) for name in baseline.namelist() if not name.endswith('/')})
with ZipFile(root / 'europe-trip-2026-B3-update.zip') as baseline:
    previous.update({name: baseline.read(name) for name in baseline.namelist() if not name.endswith('/')})
with ZipFile(root / 'europe-trip-2026-B4-update.zip') as baseline:
    previous.update({name: baseline.read(name) for name in baseline.namelist() if not name.endswith('/')})
changed = {name: data for name, data in files.items() if previous.get(name) != data}
deleted = sorted(set(previous) - set(files))
assert not deleted, f'Unexpected removals: {deleted}'
target = root / 'europe-trip-2026-B43-update.zip'
with ZipFile(target, 'w', ZIP_DEFLATED) as archive:
    for name, data in sorted(changed.items()):
        archive.writestr(name, data)
with ZipFile(target) as archive:
    assert archive.testzip() is None
    assert not any(name.startswith('tests/fixtures/') for name in archive.namelist())
    assert all(archive.read(name) == files[name] for name in archive.namelist())
    assert all(previous.get(name) != archive.read(name) for name in archive.namelist())
print(f'PASS: {len(changed)} changed/new files; 0 deleted; ZIP integrity and byte differences verified; {target.stat().st_size} bytes')
print('\n'.join(sorted(changed)))
