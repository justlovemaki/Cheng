#!/usr/bin/env python3
"""Register the optional LexiHalo Native Messaging host for this user only.
Usage: python native/install.py <32-character extension ID> [chrome|edge]
"""
import json
from pathlib import Path
import re
import shutil
import sys

NAME = 'ai.lexihalo.asr'


def install(extension_id, browser='chrome'):
    if not re.fullmatch(r'[a-p]{32}', extension_id):
        raise ValueError('Copy the 32-character ID from chrome://extensions (enable Developer mode)')
    if browser not in ('chrome', 'edge'):
        raise ValueError('Supported browsers: chrome, edge')
    host = (Path(__file__).parent / 'lexihalo_asr.py').resolve()
    if not host.is_file():
        raise FileNotFoundError(host)
    home = Path.home()
    if sys.platform == 'win32':
        import winreg
        directory = home / 'AppData/Local/LexiHalo/NativeMessagingHosts'
        registry = (r'Software\Google\Chrome' if browser == 'chrome' else r'Software\Microsoft\Edge') + '\\NativeMessagingHosts\\' + NAME
    elif sys.platform == 'darwin':
        directory = home / ('Library/Application Support/Google/Chrome' if browser == 'chrome' else 'Library/Application Support/Microsoft Edge') / 'NativeMessagingHosts'
    else:
        directory = home / ('.config/google-chrome' if browser == 'chrome' else '.config/microsoft-edge') / 'NativeMessagingHosts'
    directory.mkdir(parents=True, exist_ok=True)
    installed_host = directory / 'lexihalo_asr.py'
    shutil.copy2(host, installed_host)
    shutil.copy2(Path(__file__).parent / 'media_sites.py', directory / 'media_sites.py')
    shutil.copy2(Path(__file__).parent.parent / 'config/media-platforms.json', directory / 'media-platforms.json')
    (directory / 'media-sites.json').unlink(missing_ok=True)
    shutil.copy2(Path(__file__).parent / 'THIRD_PARTY_NOTICES.txt', directory / 'THIRD_PARTY_NOTICES.txt')
    if sys.platform != 'win32':
        installed_host.chmod(0o700)
    # Chrome launches an executable path with no arguments; a tiny wrapper binds
    # the Python interpreter and the installed script location.
    if sys.platform == 'win32':
        wrapper = directory / 'lexihalo-asr.bat'
        wrapper.write_text(f'@echo off\r\n"{sys.executable}" "{installed_host}"\r\n', encoding='utf-8')
    else:
        wrapper = directory / 'lexihalo-asr'
        import shlex
        wrapper.write_text('#!/bin/sh\nexec ' + shlex.quote(sys.executable) + ' ' + shlex.quote(str(installed_host)) + '\n', encoding='utf-8')
        wrapper.chmod(0o700)
    manifest = directory / (NAME + '.json')
    manifest.write_text(json.dumps({'name': NAME, 'description': 'LexiHalo optional local media helper',
                                    'path': str(wrapper), 'type': 'stdio',
                                    'allowed_origins': [f'chrome-extension://{extension_id}/']}, indent=2), encoding='utf-8')
    if sys.platform == 'win32':
        with winreg.CreateKey(winreg.HKEY_CURRENT_USER, registry) as key:
            winreg.SetValueEx(key, '', 0, winreg.REG_SZ, str(manifest))
    return manifest


if __name__ == '__main__':
    try:
        if len(sys.argv) not in (2, 3):
            raise ValueError('Usage: python native/install.py <extension ID> [chrome|edge]')
        print('Registered:', install(sys.argv[1], sys.argv[2] if len(sys.argv) == 3 else 'chrome'))
        print('Install yt-dlp and ffmpeg/ffprobe on PATH, then reload the extension.')
    except (ValueError, OSError) as error:
        sys.exit(str(error))
