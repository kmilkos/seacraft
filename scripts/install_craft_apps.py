#!/usr/bin/env python3
import os
import json
import shutil
import zipfile
import urllib.request

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
APPS_DIR = os.path.join(BASE_DIR, 'public', 'apps')

APP_NAMES = [
    # Office
    'wordcraft',
    'gridcraft',
    'deckcraft',
    'pdfcraft',
    'designcraft',
    # Images & Design
    'photocraft',
    'lightcraft',
    'vectorcraft',
    'figcraft',
    # Video, Motion, Audio, CAD
    'filmcraft',
    'effectcraft',
    'soundcraft',
    'cadcraft',
]


def get_latest_web_zip(repo_name: str):
    api_url = f'https://api.github.com/repos/storytold/{repo_name}/releases/latest'
    req = urllib.request.Request(api_url, headers={'User-Agent': 'SeaCraft-Installer'})
    with urllib.request.urlopen(req, timeout=20) as resp:
        data = json.loads(resp.read().decode('utf-8'))
    for asset in data.get('assets', []):
        name = asset.get('name', '').lower()
        if 'web' in name and name.endswith('.zip'):
            return data.get('tag_name', ''), asset['browser_download_url']
    return None, None


def main():
    os.makedirs(APPS_DIR, exist_ok=True)
    for app in APP_NAMES:
        dest_dir = os.path.join(APPS_DIR, app)
        if os.path.isfile(os.path.join(dest_dir, 'index.html')):
            print(f'[skip] {app} already installed')
            continue

        print(f'[fetch] Querying latest release for storytold/{app}...')
        tag, url = get_latest_web_zip(app)
        if not url:
            print(f'[warn] No web zip found for {app}, skipping')
            continue

        zip_path = f'/tmp/{app}-web.zip'
        print(f'[download] {app} ({tag})...')
        req = urllib.request.Request(url, headers={'User-Agent': 'SeaCraft-Installer'})
        with urllib.request.urlopen(req, timeout=180) as resp, open(zip_path, 'wb') as out:
            shutil.copyfileobj(resp, out)

        if os.path.exists(dest_dir):
            shutil.rmtree(dest_dir)
        os.makedirs(dest_dir, exist_ok=True)

        with zipfile.ZipFile(zip_path, 'r') as zf:
            zf.extractall(dest_dir)

        entries = os.listdir(dest_dir)
        if len(entries) == 1 and os.path.isdir(os.path.join(dest_dir, entries[0])):
            inner = os.path.join(dest_dir, entries[0])
            for item in os.listdir(inner):
                shutil.move(os.path.join(inner, item), os.path.join(dest_dir, item))
            os.rmdir(inner)

        os.remove(zip_path)
        print(f'[ok] {app} installed')


if __name__ == '__main__':
    main()
