"""Build a Pages artifact from tracked public assets, excluding tooling/backups."""
from pathlib import Path
import shutil
import subprocess

root = Path(__file__).resolve().parent.parent
target = root / '.pages-public'
if target.exists():
    shutil.rmtree(target)
target.mkdir()
extensions = {'.html', '.js', '.css', '.json', '.png', '.jpg', '.jpeg', '.svg',
              '.webp', '.gif', '.ico', '.mp3', '.wav', '.mp4', '.webm', '.pdf',
              '.txt', '.woff2', '.woff', '.ttf', '.otf', '.webmanifest', '.xml'}
excluded_roots = {'.git', '.github', 'node_modules', 'tests', 'security', 'scripts',
                  'supabase', 'docs'}
count = 0
for filename in subprocess.check_output(['git', 'ls-files', '-z'], cwd=root).decode().split('\0'):
    if not filename:
        continue
    path = Path(filename)
    if path.parts[0] in excluded_roots or path.is_absolute() or '..' in path.parts:
        continue
    if path.name not in {'CNAME', '.nojekyll'} and path.suffix.lower() not in extensions:
        continue
    if path.name in {'firebase.json', 'firebase.security.json', 'firestore.indexes.json'}:
        continue
    if path.name.startswith(('audit', 'check_', 'debug_', 'diagnose_', 'dryrun_', 'fix_')):
        continue
    source = root / path
    if not source.is_file() or source.is_symlink():
        raise RuntimeError(f'Unexpected tracked public file: {path}')
    destination = target / path
    destination.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(source, destination)
    count += 1
(target / '.nojekyll').touch()
assert (target / 'index.html').is_file(), 'Missing app entry'
assert (target / 'device-access.js').is_file(), 'Missing approved-device module'
assert not (target / 'security').exists(), 'Recovery artifacts must not be served'
print(f'Packaged {count} public files from the checked-out commit.')
