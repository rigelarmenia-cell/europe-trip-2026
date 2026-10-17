"""Package public project files only. Source briefs and private links are never inputs."""
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED

root = Path(__file__).resolve().parent.parent
roots = ['.gitignore', '.nojekyll', 'index.html', 'styles.css', 'app.js', 'sw.js', 'manifest.webmanifest', 'trip.json', 'demo-trip.json', 'paths.json', 'package.json', 'README.md', 'STATE.md', 'lib', 'icons', 'vendor', 'docs', 'tests', 'tools']
paths = []
for name in roots:
    source = root / name
    paths.extend(sorted(p for p in source.rglob('*') if p.is_file()) if source.is_dir() else [source])
target = root / 'europe-trip-2026-full-current.zip'
with ZipFile(target, 'w', ZIP_DEFLATED) as archive:
    for path in paths:
        if '__pycache__' in path.parts or path.relative_to(root).as_posix().startswith('tests/fixtures/'):
            continue
        archive.write(path, path.relative_to(root).as_posix())
with ZipFile(target) as archive:
    assert archive.testzip() is None
    assert 'index.html' in archive.namelist()
    assert not any(name.startswith(('.git/', 'artifacts/')) for name in archive.namelist())
    print(f'PASS: {target.name}; {len(archive.namelist())} files; root index.html; ZIP integrity checked; {target.stat().st_size} bytes')
