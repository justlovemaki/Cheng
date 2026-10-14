#!/usr/bin/env python3
"""Optional Native Messaging media helper. Never receives an API key.

Only the extension's configured origin may call this host (see install.py). It
prepares bounded PCM WAV chunks for ASR and can list/download user-selected
video formats into Downloads/LexiHalo. ASR remains in the extension/BYOK.
"""
import base64
from collections import deque
import csv
import hashlib
import ipaddress
import json
import math
import os
from pathlib import Path
import queue
import re
import shutil
import socket
import struct
import subprocess
import sys
import threading
import time
from urllib.parse import urlparse
import uuid
import media_sites

HOST = 'ai.lexihalo.asr'
ROOT = Path.home() / '.lexihalo' / 'asr'
DOWNLOAD_ROOT = Path.home() / 'Downloads' / 'LexiHalo'
HOSTS = ('youtube.com', 'youtu.be', 'bilibili.com', 'ted.com', 'vimeo.com', 'pornhub.com')
FORMAT_ID = re.compile(r'[0-9A-Za-z._-]{1,80}')
MAX_MESSAGE_AUDIO = 600_000  # Base64 + JSON stays below Chrome's 1 MiB host->extension limit.
MAX_AUDIO_CHUNK = 4 * 1024 * 1024
MAX_CHUNKS = 240
MAX_UPLOAD_BYTES = 2 * 1024 ** 3
MAX_UPLOAD_PART = 192 * 1024


def is_pornhub_url(value):
    try:
        host = (urlparse(value).hostname or '').lower()
        return host == 'pornhub.com' or host.endswith('.pornhub.com')
    except (TypeError, ValueError):
        return False


def job_path(job_id):
    if not isinstance(job_id, str) or not re.fullmatch(r'[0-9a-f]{32}', job_id):
        raise ValueError('Invalid task identifier')
    return ROOT / job_id


def validate_url(value):
    if not isinstance(value, str) or len(value) > 2048:
        raise ValueError('Invalid media URL')
    url = urlparse(value)
    host = (url.hostname or '').lower()
    if url.scheme != 'https' or url.username or url.password or url.port:
        raise ValueError('Only public HTTPS video pages are allowed')
    site = media_sites.site_of(value)
    if site and not media_sites.is_item(value):
        raise ValueError('Not a supported media detail page')
    known_host = any(host == name or host.endswith('.' + name) for name in HOSTS)
    if not known_host:
        if (not re.fullmatch(r'(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9-]{2,63}', host)
                or host.endswith(('.local', '.localhost', '.internal'))):
            raise ValueError('Only public HTTPS video pages are allowed')
        try:
            addresses = {item[4][0].split('%', 1)[0]
                         for item in socket.getaddrinfo(host, 443, type=socket.SOCK_STREAM)}
        except OSError as error:
            raise ValueError('Unable to resolve the video website') from error
        if not addresses or any(not ipaddress.ip_address(address).is_global for address in addresses):
            raise ValueError('Private or local video websites are not allowed')
    if host.endswith('youtube.com'):
        video_id = url.query.split('&') if url.path == '/watch' else []
        video_id = next((item[2:] for item in video_id if item.startswith('v=')), '')
        video_id = video_id or (re.fullmatch(r'/(?:shorts|live)/([A-Za-z0-9_-]{11})/?', url.path).group(1) if re.fullmatch(r'/(?:shorts|live)/([A-Za-z0-9_-]{11})/?', url.path) else '')
        if not re.fullmatch(r'[A-Za-z0-9_-]{11}', video_id):
            raise ValueError('Not a YouTube video page')
    elif host == 'youtu.be' or host.endswith('.youtu.be'):
        if not re.fullmatch(r'/[A-Za-z0-9_-]{11}/?', url.path):
            raise ValueError('Not a YouTube video page')
    elif host.endswith('bilibili.com'):
        if not re.fullmatch(r'/video/BV[0-9A-Za-z]{10}/?', url.path):
            raise ValueError('Not a Bilibili video page')
    elif host.endswith('ted.com'):
        if not re.fullmatch(r'/talks/[A-Za-z0-9_-]+/?', url.path):
            raise ValueError('Not a TED talk')
    elif host.endswith('vimeo.com'):
        if not re.fullmatch(r'/(?:video/)?\d{5,12}/?', url.path):
            raise ValueError('Not a Vimeo video page')
    elif host.endswith('pornhub.com'):
        video_id = ''
        if url.path in ('/view_video.php', '/video/show'):
            video_id = next((item[8:] for item in url.query.split('&') if item.startswith('viewkey=')), '')
        else:
            match = re.fullmatch(r'/embed/([A-Za-z0-9]+)/?', url.path)
            video_id = match.group(1) if match else ''
        if not re.fullmatch(r'[A-Za-z0-9]+', video_id):
            raise ValueError('Not a Pornhub video page')
    return value


def save(path, data):
    temporary = path.with_name(
        f'.{path.name}.{os.getpid()}.{uuid.uuid4().hex}.tmp'
    )
    temporary.write_text(json.dumps(data), encoding='utf-8')
    try:
        for attempt in range(20):
            try:
                os.replace(temporary, path)
                return
            except PermissionError:
                if attempt == 19:
                    raise
                time.sleep(.05)
    finally:
        temporary.unlink(missing_ok=True)


def state(directory):
    try:
        return json.loads((directory / 'status.json').read_text(encoding='utf-8'))
    except (OSError, ValueError):
        return {'state': 'preparing'}


def cancelled(directory):
    return (directory / 'cancel').exists()


def run(command, directory, stage):
    if cancelled(directory):
        raise RuntimeError('Cancelled')
    save(directory / 'status.json', {'state': 'preparing', 'stage': stage})
    with (directory / 'worker.log').open('a', encoding='utf-8') as log:
        process = subprocess.Popen(command, stdout=log, stderr=log, stdin=subprocess.DEVNULL)
        try:
            while process.poll() is None:
                if cancelled(directory):
                    process.terminate()
                    try:
                        process.wait(timeout=3)
                    except subprocess.TimeoutExpired:
                        process.kill()
                    raise RuntimeError('Cancelled')
                time.sleep(.25)
            if process.returncode:
                log.flush()
                try:
                    text = (directory / 'worker.log').read_text(
                        encoding='utf-8', errors='replace'
                    )
                    lines = [
                        re.sub(r'\x1b\[[0-9;]*m', '', line).strip()
                        for line in text.splitlines()
                        if line.strip()
                    ]
                    errors = [
                        line
                        for line in lines
                        if 'ERROR:' in line or 'error' in line.lower()
                    ]
                    detail = ' '.join(errors[-3:] or lines[-3:])[-700:]
                except OSError:
                    detail = ''
                raise RuntimeError(
                    f'{stage}失败（退出码 {process.returncode}）'
                    + (f'：{detail}' if detail else '；检查工具和网站权限')
                )
        finally:
            if process.poll() is None:
                process.kill()
                process.wait()


def parse_download_progress(line):
    marker = 'LEXIHALO_PROGRESS|'
    if marker not in line:
        return None
    values = line.split(marker, 1)[1].strip().split('|')
    if not values:
        return None
    try:
        percent = float(values[0].strip().rstrip('%'))
    except ValueError:
        return None
    if not math.isfinite(percent):
        return None
    return {
        'percent': max(0, min(100, percent)),
        'speed': (values[1].strip() if len(values) > 1 else '')[:40],
        'eta': (values[2].strip() if len(values) > 2 else '')[:20],
    }


def run_download(command, directory, stage, expected_parts):
    if cancelled(directory):
        raise RuntimeError('Cancelled')
    save(directory / 'status.json', {'state': 'preparing', 'stage': stage, 'percent': 0})
    lines = queue.Queue()
    with (directory / 'worker.log').open('a', encoding='utf-8') as log:
        process = subprocess.Popen(command, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                                   stdin=subprocess.DEVNULL, text=True, encoding='utf-8',
                                   errors='replace', bufsize=1)
        def read_output():
            try:
                for line in process.stdout:
                    lines.put(line)
            finally:
                lines.put(None)
        reader = threading.Thread(target=read_output, daemon=True)
        reader.start()
        part = 0
        previous = 0.0
        last_write = 0.0
        output_tail = deque(maxlen=30)
        try:
            while process.poll() is None or reader.is_alive() or not lines.empty():
                if cancelled(directory) and process.poll() is None:
                    process.terminate()
                    try:
                        process.wait(timeout=3)
                    except subprocess.TimeoutExpired:
                        process.kill()
                    raise RuntimeError('Cancelled')
                try:
                    line = lines.get(timeout=.2)
                except queue.Empty:
                    continue
                if line is None:
                    continue
                log.write(line)
                log.flush()
                clean_line = re.sub(r'\x1b\[[0-9;]*m', '', line).strip()
                if clean_line and 'LEXIHALO_PROGRESS|' not in clean_line:
                    output_tail.append(clean_line)
                progress = parse_download_progress(line)
                if not progress:
                    continue
                current = progress['percent']
                if current + 10 < previous and previous >= 85 and part < expected_parts - 1:
                    part += 1
                previous = current
                overall = min(90, 90 * (part + current / 100) / max(1, expected_parts))
                now = time.monotonic()
                if now - last_write >= .25 or current >= 100:
                    detail = f"{stage} · {round(overall)}%"
                    if progress['speed'] and progress['speed'] != 'N/A':
                        detail += f" · {progress['speed']}"
                    if progress['eta'] and progress['eta'] != 'N/A':
                        detail += f" · 剩余 {progress['eta']}"
                    save(directory / 'status.json', {
                        'state': 'preparing', 'stage': detail,
                        'percent': round(overall, 1),
                        'speed': progress['speed'], 'eta': progress['eta'],
                    })
                    last_write = now
            if process.returncode:
                errors = [
                    line
                    for line in output_tail
                    if "ERROR:" in line or "error" in line.lower()
                ]
                detail = " ".join(errors[-3:] or list(output_tail)[-3:])[-700:]
                raise RuntimeError(
                    f"{stage}失败（退出码 {process.returncode}）"
                    + (f"：{detail}" if detail else "；检查工具和网站权限")
                )
        finally:
            if process.poll() is None:
                process.kill()
                process.wait()


def find_tool(name):
    found = shutil.which(name)
    if found:
        return found
    suffix = '.exe' if sys.platform == 'win32' else ''
    candidates = [Path('/opt/homebrew/bin'), Path('/usr/local/bin'), Path.home() / '.local/bin',
                  Path(sys.executable).parent, Path(sys.executable).parent / 'Scripts']
    return next((str(folder / (name + suffix)) for folder in candidates if (folder / (name + suffix)).is_file()), None)


FORMAT_CACHE_TTL = 10 * 60


def format_cache_path(url):
    return ROOT / 'format-cache' / (hashlib.sha256(url.encode('utf-8')).hexdigest() + '.json')


def load_format_cache(url):
    path = format_cache_path(url)
    try:
        if not path.is_file() or time.time() - path.stat().st_mtime > FORMAT_CACHE_TTL or path.stat().st_size > 16 * 1024 * 1024:
            path.unlink(missing_ok=True)
            return None
        data = json.loads(path.read_text(encoding='utf-8'))
        return data if isinstance(data, dict) and isinstance(data.get('formats'), list) else None
    except (OSError, ValueError, json.JSONDecodeError):
        path.unlink(missing_ok=True)
        return None


def save_format_cache(url, info):
    if not is_pornhub_url(url) or not any(str(item.get('protocol') or '').startswith('m3u8') for item in info.get('formats') or []):
        return
    path = format_cache_path(url)
    path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    raw = json.dumps(info, ensure_ascii=False, separators=(',', ':'))
    if len(raw.encode('utf-8')) > 16 * 1024 * 1024: return
    temporary = path.with_suffix('.tmp-' + uuid.uuid4().hex)
    try:
        temporary.write_text(raw, encoding='utf-8')
        try: temporary.chmod(0o600)
        except OSError: pass
        os.replace(temporary, path)
    finally:
        temporary.unlink(missing_ok=True)


def cached_pornhub_hls(info, resolution):
    candidates = [item for item in info.get('formats') or []
                  if FORMAT_ID.fullmatch(str(item.get('format_id') or ''))
                  and str(item.get('protocol') or '').startswith('m3u8')
                  and int(item.get('height') or item.get('width') or 0) <= max(1, resolution)]
    exact = [item for item in candidates if int(item.get('height') or item.get('width') or 0) == resolution]
    pool = exact or candidates
    return max(pool, key=lambda item: (int(item.get('height') or item.get('width') or 0),
        float(item.get('fps') or 0), float(item.get('tbr') or 0)), default=None)


def inspect_formats(url):
    yt_dlp = find_tool('yt-dlp')
    if not yt_dlp:
        raise RuntimeError('缺少 yt-dlp；请先安装并重新检查')
    command = [yt_dlp, '--ignore-config', '--no-playlist', '--no-warnings', '--skip-download',
               '--socket-timeout', '20', '--retries', '2', '--dump-single-json']
    pornhub = is_pornhub_url(url)
    if pornhub:
        command += ['--referer', 'https://www.pornhub.com/',
                    '--add-header', 'Origin:https://www.pornhub.com',
                    '--add-header', 'Cookie:accessAgeDisclaimerPH=2; age_verified=1; accessPH=1']
    attempts = 5 if pornhub else 1
    info = None
    last_error = None
    for attempt in range(attempts):
        try:
            result = subprocess.run([*command, url], capture_output=True, text=True, timeout=90, check=True)
            if len(result.stdout) > 16 * 1024 * 1024: raise RuntimeError('视频格式信息过大')
            candidate = json.loads(result.stdout)
            info = candidate
            if not pornhub or any(str(item.get('protocol') or '').startswith('m3u8') for item in candidate.get('formats') or []):
                break
        except subprocess.TimeoutExpired as error:
            last_error = RuntimeError('yt-dlp 识别视频超时')
            if not pornhub or attempt + 1 >= attempts: raise last_error from error
        except subprocess.CalledProcessError as error:
            detail = re.sub(r'\s+', ' ', (error.stderr or '').strip())[-500:]
            last_error = RuntimeError('yt-dlp 无法识别此视频' + (f'：{detail}' if detail else ''))
            if not pornhub or attempt + 1 >= attempts: raise last_error from error
        if attempt + 1 < attempts: time.sleep(1)
    if info is None: raise last_error or RuntimeError('yt-dlp 没有返回视频信息')
    if pornhub:
        if not any(str(item.get('protocol') or '').startswith('m3u8') for item in info.get('formats') or []):
            raise RuntimeError('Pornhub 暂未返回可下载 HLS，请稍后重试')
        save_format_cache(url, info)
    return metadata_from_info(info, url)


def metadata_from_info(info, url=''):
    duration = float(info.get('duration') or 0)
    if not math.isfinite(duration) or duration < 0 or duration > 4 * 3600:
        raise RuntimeError('仅支持四小时以内的媒体')
    if info.get('is_live') is True:
        raise RuntimeError('暂不支持直播视频')
    # yt-dlp often exposes several codecs/containers for the same visual
    # resolution. The player UI needs one useful choice per resolution rather
    # than a raw format dump, so retain the strongest candidate in each group.
    grouped = {}
    seen = set()
    for item in info.get('formats') or []:
        format_id = str(item.get('format_id') or '')
        if not FORMAT_ID.fullmatch(format_id) or format_id in seen:
            continue
        raw_vcodec = item.get('vcodec')
        vcodec = str(raw_vcodec or 'unknown')
        height = int(item.get('height') or 0)
        width = int(item.get('width') or 0)
        raw_acodec = item.get('acodec')
        is_audio = raw_vcodec == 'none' and raw_acodec != 'none'
        if not is_audio and height <= 0 and width <= 0:
            is_audio = str(item.get('ext') or '').lower() in ('mp3', 'm4a', 'aac', 'wav', 'flac', 'ogg', 'opus')
            if not is_audio: continue
        seen.add(format_id)
        resolution = 0 if is_audio else min(width, height) if width > 0 and height > 0 else height or width
        acodec = str(raw_acodec or 'unknown')
        has_audio = raw_acodec != 'none'
        filesize = int(item.get('filesize') or item.get('filesize_approx') or 0)
        fps = float(item.get('fps') or 0)
        fps = round(fps, 2) if math.isfinite(fps) else 0
        tbr = float(item.get('tbr') or item.get('vbr') or 0)
        tbr = tbr if math.isfinite(tbr) else 0
        ext = str(item.get('ext') or 'mp4')[:12]
        protocol = str(item.get('protocol') or '')
        note = str(item.get('format_note') or '')[:60]
        codec_lower = vcodec.lower()
        codec_label = ('H.264' if codec_lower.startswith(('avc', 'h264')) else
                       'H.265' if codec_lower.startswith(('hev', 'h265')) else
                       'AV1' if codec_lower.startswith(('av01', 'av1')) else
                       'VP9' if codec_lower.startswith('vp9') else vcodec.split('.')[0].upper()[:12])
        candidate = {
            'formatId': format_id,
            'width': width,
            'height': height,
            'resolution': resolution,
            'isAudio': is_audio,
            'fps': fps,
            'ext': ext,
            'vcodec': vcodec[:40],
            'codecLabel': (acodec.split('.')[0].upper()[:12] if acodec != 'unknown' else '') if is_audio else codec_label,
            'acodec': acodec[:40],
            'hasAudio': has_audio,
            'filesize': max(0, filesize),
            'note': note,
            'label': (f'音频 · {ext.upper()}' if is_audio else f'{resolution}p' + (f' · {round(fps)}fps' if fps > 30 else '')),
            '_score': (int(is_pornhub_url(url) and protocol.startswith('m3u8')),
                       fps, tbr, filesize, int(ext == 'mp4'), int(codec_label == 'H.264'), int(has_audio)),
        }
        previous = grouped.get(resolution)
        if previous is None or candidate['_score'] > previous['_score']:
            grouped[resolution] = candidate
    formats = sorted(grouped.values(), key=lambda item: item['resolution'], reverse=True)
    for item in formats:
        item.pop('_score', None)
    if not formats:
        raise RuntimeError('没有识别到可下载的视频格式')
    return {
        'title': str(info.get('title') or 'video')[:240],
        'duration': duration,
        'formats': formats[:160],
    }


def unique_destination(path):
    if not path.exists():
        return path
    for index in range(1, 1000):
        candidate = path.with_name(f'{path.stem} ({index}){path.suffix}')
        if not candidate.exists():
            return candidate
    raise RuntimeError('下载目录中存在过多同名文件')


def _audio_download_strategy(_url, _selected, _resolution):
    return {'name': 'audio', 'selector': 'bestaudio/best[acodec!=none]/best', 'expected_parts': 1, 'attempts': 1}


def _pornhub_hls_strategy(_url, _selected, resolution):
    return {'name': 'pornhub-hls',
        'selector': (f'best[height={resolution}][protocol^=m3u8]/best[height<={resolution}][protocol^=m3u8]'),
        'expected_parts': 1, 'attempts': 5}


def _muxed_video_strategy(_url, _selected, resolution):
    return {'name': 'muxed-video',
        'selector': f'best[height={resolution}]/best[height<={resolution}]',
        'expected_parts': 1, 'attempts': 1}


def _split_video_strategy(_url, _selected, resolution):
    return {'name': 'split-video-audio',
        'selector': (f'bestvideo[height={resolution}]+bestaudio/best[height={resolution}]/'
                     f'bestvideo[height<={resolution}]+bestaudio/best[height<={resolution}]'),
        'expected_parts': 2, 'attempts': 1}


DOWNLOAD_STRATEGIES = (
    (lambda url, selected: selected.get('isAudio') is True, _audio_download_strategy),
    (lambda url, selected: is_pornhub_url(url), _pornhub_hls_strategy),
    (lambda url, selected: selected.get('hasAudio') is True, _muxed_video_strategy),
    (lambda url, selected: True, _split_video_strategy),
)


def resolve_download_strategy(url, selected, resolution):
    for matches, factory in DOWNLOAD_STRATEGIES:
        if matches(url, selected): return factory(url, selected, resolution)
    raise RuntimeError('没有匹配的下载策略')


def download_worker(directory, url, format_id, requested_resolution):
    try:
        if not FORMAT_ID.fullmatch(format_id):
            raise ValueError('Invalid format identifier')
        yt_dlp, ffmpeg = (find_tool(name) for name in ('yt-dlp', 'ffmpeg'))
        if not yt_dlp or not ffmpeg:
            raise RuntimeError('缺少 yt-dlp 或 ffmpeg；请先安装并重新检查')
        pornhub = is_pornhub_url(url)
        cached_info = load_format_cache(url) if pornhub else None
        metadata = metadata_from_info(cached_info, url) if cached_info else inspect_formats(url)
        selected = next((item for item in metadata['formats'] if item['formatId'] == format_id), None)
        if not selected:
            selected = next(
                (item for item in metadata['formats']
                 if item.get('resolution') == requested_resolution),
                None,
            )
        if not selected:
            raise RuntimeError('所选清晰度已失效，请重新获取格式列表')
        # HLS format IDs may include a measured bitrate (for example hls-799)
        # that changes slightly between probes. Always use the fresh ID.
        format_id = selected['formatId']
        resolution = selected.get('resolution') or requested_resolution
        strategy = resolve_download_strategy(url, selected, resolution)
        selector = strategy['selector']
        expected_parts = strategy['expected_parts']
        base_command = [yt_dlp, '--ignore-config', '--no-playlist', '--newline', '--no-colors', '--no-warnings',
             '--progress-delta', '0.5',
             '--progress-template', 'download:LEXIHALO_PROGRESS|%(progress._percent_str)s|%(progress._speed_str)s|%(progress._eta_str)s',
             '--match-filter', '!is_live', '--max-filesize', '8G', '--socket-timeout', '20',
             '--retries', '3', '--fragment-retries', '3',
             '--merge-output-format', 'mp4', '--windows-filenames']
        output_template = str(directory / '%(title).180B [%(id)s] [%(height)sp].%(ext)s')
        attempts = strategy['attempts']
        for attempt in range(attempts):
            if pornhub:
                cached_info = load_format_cache(url)
                cached_hls = cached_pornhub_hls(cached_info or {}, resolution)
                if cached_hls:
                    command = [*base_command, '-f', str(cached_hls['format_id']),
                               '--referer', 'https://www.pornhub.com/',
                               '--add-header', 'Origin:https://www.pornhub.com',
                               '--load-info-json', str(format_cache_path(url)),
                               '-o', output_template]
                else:
                    command = [*base_command, '-f', selector,
                               '--referer', 'https://www.pornhub.com/',
                               '--add-header', 'Origin:https://www.pornhub.com',
                               '--add-header', 'Cookie:accessAgeDisclaimerPH=2; age_verified=1; accessPH=1',
                               '-o', output_template, url]
            else:
                command = [*base_command, '-f', selector, '-o', output_template, url]
            try:
                run_download(command, directory,
                    f'正在下载 {selected["label"]}' + (f'（刷新 HLS {attempt + 1}/{attempts}）' if attempt else ''),
                    expected_parts)
                break
            except RuntimeError as error:
                retryable = re.search(r'Requested format is not available|HTTP Error (?:404|410|474)', str(error), re.I)
                if not retryable or attempt + 1 >= attempts or cancelled(directory): raise
                for partial in directory.iterdir():
                    if partial.is_file() and partial.name not in {'status.json', 'worker.log', 'cancel'}:
                        partial.unlink(missing_ok=True)
                format_cache_path(url).unlink(missing_ok=True)
                save(directory / 'status.json', {'state': 'preparing',
                    'stage': f'Pornhub HLS 签名已失效，正在重新解析（{attempt + 2}/{attempts}）', 'percent': 0})
                inspect_formats(url)
        save(directory / 'status.json', {'state': 'preparing', 'stage': '正在整理下载文件…', 'percent': 96})
        ignored = {'status.json', 'worker.log', 'cancel'}
        files = [path for path in directory.iterdir()
                 if path.is_file() and path.name not in ignored and not path.name.endswith(('.part', '.ytdl'))]
        if len(files) != 1:
            raise RuntimeError('下载结果文件数量异常')
        DOWNLOAD_ROOT.mkdir(parents=True, exist_ok=True)
        destination = unique_destination(DOWNLOAD_ROOT / files[0].name)
        shutil.move(str(files[0]), destination)
        save(directory / 'status.json', {'state': 'ready', 'filename': destination.name,
                                          'directory': str(DOWNLOAD_ROOT), 'path': str(destination),
                                          'format': selected})
    except Exception as error:
        message = str(error)[:900]
        save(directory / 'status.json', {'state': 'error', 'error': message})
        try:
            source_log = directory / 'worker.log'
            if source_log.is_file():
                shutil.copyfile(source_log, ROOT / 'last-download-error.log')
            (ROOT / 'last-download-error.txt').write_text(message, encoding='utf-8')
        except OSError:
            pass


def validate_imported_container(path, normalize=False):
    with path.open('rb') as source:
        header = source.read(256 * 1024)
    # Bytes, not playlists/scripts. A local playlist could otherwise name files
    # outside the job even though network protocols are disabled in ffmpeg.
    mp4 = len(header) >= 8 and header[4:8] in (b'ftyp', b'styp', b'moov', b'moof', b'free', b'sidx')
    wave = header.startswith(b'RIFF') and header[8:12] == b'WAVE'
    audio = header.startswith((b'ID3', b'OggS', b'fLaC')) or (len(header) >= 2 and header[0] == 0xff and header[1] & 0xe0 == 0xe0)
    def aligned_ts(offset):
        remaining = path.stat().st_size - offset
        checks = min(8, remaining // 188)
        return remaining >= 3 * 188 and remaining % 188 == 0 and checks >= 3 and all(
            offset + index * 188 < len(header) and header[offset + index * 188] == 0x47
            for index in range(checks)
        )
    ts_offset = 0 if aligned_ts(0) else None
    # Some HLS providers disguise each TS segment as a JPEG by prepending one
    # complete, tiny image. Accept only an actual JPEG terminator immediately
    # followed by packet-aligned MPEG-TS; arbitrary images/files remain invalid.
    if ts_offset is None and header.startswith(b'\xff\xd8'):
        jpeg_end = header.find(b'\xff\xd9', 2)
        candidate = jpeg_end + 2
        if jpeg_end >= 2 and candidate <= 256 * 1024 and aligned_ts(candidate):
            ts_offset = candidate
    ts = ts_offset is not None
    webm = header.startswith(bytes.fromhex('1a45dfa3'))
    if not (mp4 or wave or audio or ts or webm):
        raise RuntimeError('导入内容不是支持的媒体字节；不接受清单、脚本或本地文件引用')
    if mp4: return 'mp4'
    if wave: return 'wav'
    if ts:
        if normalize and ts_offset:
            temporary = path.with_name(path.name + '.normalized')
            try:
                with path.open('rb') as source, temporary.open('wb') as target:
                    source.seek(ts_offset)
                    shutil.copyfileobj(source, target, 1024 * 1024)
                temporary.replace(path)
            finally:
                temporary.unlink(missing_ok=True)
        return 'ts'
    if webm: return 'webm'
    if header.startswith(b'OggS'): return 'ogg'
    if header.startswith(b'fLaC'): return 'flac'
    return 'mp3' if header.startswith(b'ID3') or (len(header) > 1 and header[1] & 0xf6 != 0xf0) else 'aac'


def cleanup_import_sources(directory):
    for pattern in ('media-[0-9]*.*', 'audio-[0-9]*.*', 'media.m3u8', 'audio.m3u8', 'entries.jsonl'):
        for path in directory.glob(pattern): path.unlink(missing_ok=True)


def import_source(directory, stream='media'):
    playlist = directory / (stream + '.m3u8')
    return playlist if playlist.is_file() else directory / ('source.bin' if stream == 'media' else 'source-audio.bin')


def local_input_options(path):
    return ['-protocol_whitelist', 'file,pipe'] + (['-allowed_extensions', 'ALL'] if path.suffix == '.m3u8' else [])


def seal_fragment_streams(directory, status):
    listing = directory / 'entries.jsonl'
    if not listing.is_file(): return
    entries = [json.loads(line) for line in listing.read_text(encoding='utf-8').splitlines()]
    for stream in ('media', 'audio'):
        items = [item for item in entries if item['stream'] == stream]
        if not items:
            raw = directory / ('source.bin' if stream == 'media' else 'source-audio.bin')
            if status['streams'][stream] and (not raw.is_file() or raw.stat().st_size != status['streams'][stream]): raise ValueError('Raw stream byte count mismatch')
            continue
        if len(items) > 5000: raise ValueError('Too many media fragments')
        files = {}
        uploaded_total = 0
        for index, item in enumerate(items):
            if item['index'] != index: raise ValueError('Invalid fragment order')
            path = directory / f'{stream}-{index:05d}.bin'
            if not path.is_file() or not path.stat().st_size: raise ValueError('Incomplete media fragment')
            uploaded_total += path.stat().st_size
            extension = validate_imported_container(path, normalize=True)
            media_path = path.with_suffix('.' + extension)
            path.replace(media_path)
            files[index] = media_path.name
        if uploaded_total != status['streams'][stream]: raise ValueError('Fragment byte count mismatch')
        segments = [item for item in items if item['kind'] == 'segment']
        duration = sum(item['duration'] for item in segments)
        if not segments or not 0 < duration <= 14400: raise ValueError('Invalid HLS duration')
        lines = ['#EXTM3U', '#EXT-X-VERSION:7', '#EXT-X-TARGETDURATION:' + str(math.ceil(max(item['duration'] for item in segments)))]
        last_map = None
        for item in segments:
            if item.get('discontinuity'): lines.append('#EXT-X-DISCONTINUITY')
            init = item.get('map')
            if init is not None and init != last_map:
                if init >= item['index'] or items[init]['kind'] != 'init': raise ValueError('Invalid initialization fragment')
                lines.append('#EXT-X-MAP:URI="' + files[init] + '"')
                last_map = init
            lines.extend([f'#EXTINF:{item["duration"]:.6f},', files[item['index']]])
        lines.append('#EXT-X-ENDLIST')
        (directory / (stream + '.m3u8')).write_text('\n'.join(lines) + '\n', encoding='utf-8')


def imported_download_worker(directory, metadata):
    try:
        ffmpeg, ffprobe = find_tool('ffmpeg'), find_tool('ffprobe')
        if not ffmpeg or not ffprobe:
            raise RuntimeError('缺少 ffmpeg 或 ffprobe')
        source = import_source(directory)
        if source.suffix != '.m3u8': validate_imported_container(source)
        secondary = import_source(directory, 'audio')
        if secondary.is_file() and secondary.stat().st_size and secondary.suffix != '.m3u8': validate_imported_container(secondary)
        probe = subprocess.run([ffprobe, '-v', 'error', *local_input_options(source),
            '-show_entries', 'format=duration:stream=codec_type,codec_name', '-of', 'json', str(source)],
            capture_output=True, text=True, timeout=20, check=True)
        info = json.loads(probe.stdout)
        duration = float(info.get('format', {}).get('duration') or 0)
        if not math.isfinite(duration) or not 0 < duration <= 4 * 3600:
            raise RuntimeError('仅支持四小时以内的媒体资源')
        streams = info.get('streams', [])
        audio_only = metadata.get('isAudio') or not any(s.get('codec_type') == 'video' for s in streams)
        audio_codec = next((str(s.get('codec_name') or '').lower() for s in streams if s.get('codec_type') == 'audio'), '')
        ext = str(metadata.get('ext') or '').lower()
        permitted = ('m4a', 'mp3', 'aac', 'wav', 'flac', 'ogg', 'webm', 'mka') if audio_only else ('mp4', 'webm', 'mkv')
        if ext not in permitted: ext = 'mka' if audio_only else 'mkv'
        compatible_audio = {
            'mp3': {'mp3'}, 'm4a': {'aac', 'alac', 'mp3'}, 'aac': {'aac'},
            'wav': {'pcm_s16le', 'pcm_s24le', 'pcm_s32le', 'pcm_f32le'},
            'flac': {'flac'}, 'ogg': {'vorbis', 'opus', 'flac'},
            'webm': {'vorbis', 'opus'}, 'mka': set(),
        }
        transcode_mp3 = audio_only and ext == 'mp3' and audio_codec != 'mp3'
        if audio_only and not transcode_mp3 and ext != 'mka' and audio_codec not in compatible_audio.get(ext, set()):
            ext = 'mka'
        filename = re.sub(r'[\x00-\x1f<>:"/\\|?*]', '_', str(metadata.get('title') or 'media')).strip(' .')[:120] or 'media'
        output = directory / ('completed.' + ext)
        secondary = import_source(directory, 'audio')
        command = [ffmpeg, '-nostdin', '-v', 'error', '-fflags', '+genpts', *local_input_options(source), '-i', str(source)]
        if secondary.is_file() and secondary.stat().st_size:
            command += [*local_input_options(secondary), '-i', str(secondary), '-map', '0:v:0?', '-map', '1:a:0']
        elif audio_only:
            command += ['-vn', '-map', '0:a:0']
        else:
            command += ['-map', '0:v:0?', '-map', '0:a:0?']
        command += (['-c:a', 'libmp3lame', '-q:a', '2'] if transcode_mp3 else ['-c', 'copy'])
        command += [str(output)]
        run(command, directory, '正在封装浏览器媒体资源')
        if cancelled(directory): raise RuntimeError('Cancelled')
        if not output.is_file() or not output.stat().st_size: raise RuntimeError('没有生成完整媒体文件')
        DOWNLOAD_ROOT.mkdir(parents=True, exist_ok=True)
        destination = unique_destination(DOWNLOAD_ROOT / (filename + '.' + ext))
        shutil.move(str(output), destination)
        save(directory / 'status.json', {'state': 'ready', 'filename': destination.name,
            'directory': str(DOWNLOAD_ROOT), 'duration': duration})
    except Exception as error:
        message = str(error)[:900]
        save(directory / 'status.json', {'state': 'error', 'error': message})
        try:
            source_log = directory / 'worker.log'
            if source_log.is_file(): shutil.copyfile(source_log, ROOT / 'last-download-error.log')
            (ROOT / 'last-download-error.txt').write_text(message, encoding='utf-8')
        except OSError:
            pass
    finally:
        for name in ('source.bin', 'source-audio.bin'):
            (directory / name).unlink(missing_ok=True)
        cleanup_import_sources(directory)
        if cancelled(directory): shutil.rmtree(directory, ignore_errors=True)


def worker(directory, url, imported=False):
    try:
        yt_dlp, ffmpeg, ffprobe = (find_tool(name) for name in ('yt-dlp', 'ffmpeg', 'ffprobe'))
        if not ffmpeg or not ffprobe or (not imported and not yt_dlp):
            raise RuntimeError('缺少所需的 yt-dlp、ffmpeg 或 ffprobe；请先安装并重新检查')
        if not imported:
            audio_selector = (
                'worst[protocol*=m3u8]/bestaudio/worst[acodec!=none]/worst'
                if is_pornhub_url(url)
                else 'bestaudio/worst[acodec!=none]/worst'
            )
            run([yt_dlp, '--ignore-config', '--no-playlist', '--no-progress', '--no-warnings',
                 '--match-filter', '!is_live', '--max-filesize', '2G', '--socket-timeout', '20',
                 '--retries', '3', '--fragment-retries', '3',
                 '-f', audio_selector,
                 '-o', str(directory / 'source.%(ext)s'), url], directory, '下载音频')
        files = [import_source(directory)] if imported else [p for p in directory.glob('source.*') if p.is_file()]
        if len(files) != 1 or files[0].stat().st_size > 2 * 1024 ** 3:
            raise RuntimeError('音频文件不存在或超过 2 GB')
        source = files[0]
        if imported and source.suffix != '.m3u8': validate_imported_container(source)
        probe = subprocess.run([ffprobe, '-v', 'error', *local_input_options(source),
                                '-show_entries', 'format=duration', '-of',
                                'default=noprint_wrappers=1:nokey=1', str(source)],
                               capture_output=True, text=True, timeout=20, check=True)
        duration = float(probe.stdout.strip())
        if not math.isfinite(duration) or not 0 < duration <= 4 * 3600:
            raise RuntimeError('仅支持四小时以内的媒体')
        # Encode each segment as its own PCM WAV. Splitting one continuous MP3
        # stream can leave a segment dependent on the previous frame's bit
        # reservoir and makes strict decoders report truncated MP3 frames.
        run([ffmpeg, '-nostdin', '-v', 'error', '-fflags', '+genpts', *local_input_options(source),
             '-i', str(source), '-vn', '-ac', '1', '-ar', '16000',
             '-c:a', 'pcm_s16le', '-f', 'segment', '-segment_time', '90',
             '-segment_list', str(directory / 'segments.csv'), '-segment_list_type', 'csv',
             '-reset_timestamps', '1', str(directory / 'part-%03d.wav')], directory, '分割音轨')
        chunks = sorted(directory.glob('part-*.wav'))
        if not chunks or len(chunks) > MAX_CHUNKS or any(c.stat().st_size > MAX_AUDIO_CHUNK for c in chunks):
            raise RuntimeError('WAV 音频分块失败或分块过大')
        if cancelled(directory):
            raise RuntimeError('Cancelled')
        source.unlink()
        # Use ffmpeg's actual input-timeline segment starts rather than summing
        # output-file durations, which can drift on long videos.
        with (directory / 'segments.csv').open(newline='', encoding='utf-8') as listing:
            rows = list(csv.reader(listing))
        if len(rows) != len(chunks):
            raise RuntimeError('音频分块时间轴不完整')
        offsets = []
        for row, chunk in zip(rows, chunks):
            if len(row) != 3 or Path(row[0]).name != chunk.name:
                raise RuntimeError('音频分块时间轴不匹配')
            offset = float(row[1])
            if not math.isfinite(offset) or offset < 0 or offset > duration + 1 or (offsets and offset <= offsets[-1]):
                raise RuntimeError('音频分块时间轴无效')
            offsets.append(round(offset, 3))
        actual_end = float(rows[-1][2])
        if not math.isfinite(actual_end) or actual_end <= offsets[-1] or actual_end > 4 * 3600 + 1:
            raise RuntimeError('音频没有可解码的采样或时长无效')
        save(directory / 'status.json', {'state': 'ready', 'count': len(chunks),
                                          'offsets': offsets, 'sizes': [c.stat().st_size for c in chunks],
                                          'duration': actual_end})
    except Exception as error:
        message = str(error)[:900]
        save(directory / 'status.json', {'state': 'error', 'error': message})
        try:
            source_log = directory / 'worker.log'
            if source_log.is_file():
                shutil.copyfile(source_log, ROOT / 'last-audio-error.log')
            (ROOT / 'last-audio-error.txt').write_text(message, encoding='utf-8')
        except OSError:
            pass
    finally:
        for path in directory.glob('source.*'):
            path.unlink(missing_ok=True)
        if imported: cleanup_import_sources(directory)
        if cancelled(directory):
            shutil.rmtree(directory, ignore_errors=True)


def handle(message):
    action = message.get('action')
    if action == 'ping':
        tools = {name: bool(find_tool(name)) for name in ('yt-dlp', 'ffmpeg', 'ffprobe')}
        return {'ok': True, 'version': 10, 'ready': all(tools.values()), 'tools': tools,
                'browserAudio': bool(tools['ffmpeg'] and tools['ffprobe']),
                'videoDownload': bool(tools['yt-dlp'] and tools['ffmpeg'])}
    if action == 'formats':
        url = validate_url(message.get('url'))
        return {'ok': True, **inspect_formats(url)}
    if action in ('start', 'startDownload', 'beginUpload'):
        import_site = message.get('siteId') if action == 'beginUpload' else None
        if import_site is not None and import_site not in {'pornhub', 'generic', *(site['id'] for site in media_sites.CATALOG)}:
            raise ValueError('Invalid media import site')
        # Imported bytes never require a signed page/CDN URL or login token.
        url = '' if import_site is not None else validate_url(message.get('url'))
        format_id = message.get('formatId') if action == 'startDownload' else None
        resolution = message.get('resolution') if action == 'startDownload' else None
        if action == 'startDownload' and (not isinstance(format_id, str) or not FORMAT_ID.fullmatch(format_id)):
            raise ValueError('Invalid format identifier')
        if action == 'startDownload' and (type(resolution) is not int or not 0 <= resolution <= 4320):
            raise ValueError('Invalid video resolution')
        ROOT.mkdir(parents=True, exist_ok=True)
        try:
            ROOT.chmod(0o700)
        except OSError:
            pass
        # Old tasks contain no keys or user audio after cleanup.
        for entry in ROOT.iterdir():
            if entry.is_dir() and time.time() - entry.stat().st_mtime > 86400:
                shutil.rmtree(entry, ignore_errors=True)
        job_id = uuid.uuid4().hex
        directory = job_path(job_id)
        directory.mkdir(mode=0o700)
        if action == 'beginUpload':
            if import_site is None and not media_sites.browser_import_allowed(url):
                shutil.rmtree(directory, ignore_errors=True)
                raise ValueError('Browser media import is not enabled for this site')
            purpose = message.get('purpose', 'transcribe')
            if purpose not in ('transcribe', 'download'):
                shutil.rmtree(directory, ignore_errors=True)
                raise ValueError('Invalid media import purpose')
            (directory / 'source.bin').touch(mode=0o600)
            save(directory / 'status.json', {'state': 'uploading', 'bytes': 0, 'sequence': 0,
                'streams': {'media': 0, 'audio': 0}, 'purpose': purpose,
                'title': str(message.get('title') or 'media')[:180],
                'ext': str(message.get('ext') or '').lower(), 'isAudio': message.get('isAudio') is True})
            return {'ok': True, 'jobId': job_id}
        save(directory / 'status.json', {'state': 'preparing', 'stage': '正在启动'})
        worker_args = ['download-worker', job_id, url, format_id, str(resolution)] if action == 'startDownload' else ['worker', job_id, url]
        subprocess.Popen([sys.executable, str(Path(__file__).resolve()), *worker_args],
                         stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                         start_new_session=True, close_fds=True)
        return {'ok': True, 'jobId': job_id}
    job_id = message.get('jobId')
    directory = job_path(job_id)
    if not directory.is_dir():
        raise ValueError('Task not found')
    if action == 'status':
        return {'ok': True, **state(directory)}
    if action in ('uploadPart', 'sealUpload'):
        status = state(directory)
        source = directory / 'source.bin'
        if status.get('state') != 'uploading' or cancelled(directory):
            raise ValueError('Upload is not active')
        stream = message.get('stream', 'media')
        if stream not in ('media', 'audio') or (stream == 'audio' and status.get('purpose') != 'download'):
            raise ValueError('Invalid media stream')
        if stream == 'audio':
            source = directory / 'source-audio.bin'
            if not source.exists(): source.touch(mode=0o600)
        streams = status.get('streams', {'media': status['bytes'], 'audio': 0})
        if action == 'uploadPart' and message.get('entry') is not None:
            entry = message['entry']
            if not isinstance(entry, dict) or type(entry.get('index')) is not int or not 0 <= entry['index'] < 5000 or entry.get('kind') not in ('init', 'segment'):
                raise ValueError('Invalid media fragment metadata')
            duration = entry.get('duration', 0)
            init = entry.get('map')
            if (type(duration) not in (int, float) or not math.isfinite(duration) or
                    (entry['kind'] == 'segment' and not 0 < duration <= 14400) or
                    (init is not None and (type(init) is not int or not 0 <= init < entry['index']))):
                raise ValueError('Invalid fragment time or initialization map')
            current = status.setdefault('fragments', {}).get(stream)
            descriptor = {'stream': stream, 'index': entry['index'], 'kind': entry['kind'],
                'duration': duration, 'map': init, 'discontinuity': entry.get('discontinuity') is True}
            if current is None or current['descriptor']['index'] != entry['index']:
                next_index = 0 if current is None else current['descriptor']['index'] + 1
                if entry['index'] != next_index or (current is None and streams[stream]): raise ValueError('Invalid fragment sequence')
                with (directory / 'entries.jsonl').open('a', encoding='utf-8') as listing:
                    listing.write(json.dumps(descriptor) + '\n')
                current = {'descriptor': descriptor, 'bytes': 0}
                status['fragments'][stream] = current
            elif current['descriptor'] != descriptor: raise ValueError('Fragment metadata changed')
            source = directory / f'{stream}-{entry["index"]:05d}.bin'
            source.touch(mode=0o600, exist_ok=True)
            if source.stat().st_size != current['bytes']: raise ValueError('Fragment byte count mismatch')
        elif action == 'uploadPart' and stream in status.get('fragments', {}):
            raise ValueError('Cannot mix raw and fragmented media')
        elif not status.get('fragments') and source.stat().st_size != streams[stream]:
            raise ValueError('Upload byte count mismatch')
        if action == 'uploadPart':
            if type(message.get('sequence')) is not int or message['sequence'] != status['sequence']:
                raise ValueError('Invalid upload sequence')
            data = message.get('data')
            if not isinstance(data, str) or not 0 < len(data) <= MAX_UPLOAD_PART * 4 // 3:
                raise ValueError('Invalid upload part')
            decoded = base64.b64decode(data, validate=True)
            if not 0 < len(decoded) <= MAX_UPLOAD_PART or status['bytes'] + len(decoded) > MAX_UPLOAD_BYTES:
                raise ValueError('Media upload exceeds size limit')
            with source.open('ab') as target:
                target.write(decoded)
            if message.get('entry') is not None: status['fragments'][stream]['bytes'] += len(decoded)
            streams[stream] += len(decoded)
            status.update(bytes=status['bytes'] + len(decoded), sequence=status['sequence'] + 1, streams=streams)
            save(directory / 'status.json', status)
            return {'ok': True, 'bytes': status['bytes'], 'sequence': status['sequence']}
        if (type(message.get('total')) is not int or message['total'] != status['bytes']
                or type(message.get('sequence')) is not int
                or status['bytes'] <= 0 or message.get('sequence') != status['sequence']):
            raise ValueError('Incomplete media upload')
        if not streams['media']:
            raise ValueError('Primary media stream is empty')
        seal_fragment_streams(directory, status)
        save(directory / 'import.json', {key: status.get(key) for key in ('purpose', 'title', 'ext', 'isAudio')})
        save(directory / 'status.json', {'state': 'preparing', 'stage': '正在转换浏览器媒体…'})
        subprocess.Popen([sys.executable, str(Path(__file__).resolve()), 'import-worker', job_id],
                         stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                         start_new_session=True, close_fds=True)
        return {'ok': True}
    if action in ('cancel', 'finish'):
        (directory / 'cancel').touch()
        if state(directory).get('state') != 'preparing':
            shutil.rmtree(directory, ignore_errors=True)
        return {'ok': True}
    if action == 'chunkPart':
        status = state(directory)
        if status.get('state') != 'ready' or cancelled(directory):
            raise ValueError('Task not ready')
        index, part = message.get('index'), message.get('part')
        if type(index) is not int or index < 0 or index >= status['count']:
            raise ValueError('Invalid chunk index')
        if type(part) is not int or part < 0 or part >= 16:
            raise ValueError('Invalid chunk part')
        path = directory / f'part-{index:03d}.wav'
        total = path.stat().st_size
        if total != status['sizes'][index] or total > MAX_AUDIO_CHUNK:
            raise ValueError('Chunk changed or is too large')
        start = part * MAX_MESSAGE_AUDIO
        if start >= total:
            raise ValueError('Chunk part is out of range')
        with path.open('rb') as source:
            source.seek(start)
            data = source.read(MAX_MESSAGE_AUDIO)
        return {'ok': True, 'audio': base64.b64encode(data).decode('ascii'),
                'offset': status['offsets'][index], 'total': total,
                'done': start + len(data) >= total}
    raise ValueError('Unknown action')


def receive():
    header = sys.stdin.buffer.read(4)
    if len(header) != 4:
        return None
    length = struct.unpack('<I', header)[0]
    if length > 300_000:
        raise ValueError('Message too large')
    payload = sys.stdin.buffer.read(length)
    if len(payload) != length:
        raise ValueError('Incomplete message')
    return json.loads(payload)


def main():
    if len(sys.argv) == 3 and sys.argv[1] == 'import-worker':
        directory = job_path(sys.argv[2])
        metadata = json.loads((directory / 'import.json').read_text(encoding='utf-8'))
        if metadata.get('purpose') == 'download':
            imported_download_worker(directory, metadata)
        else:
            worker(directory, '', imported=True)
        return
    if len(sys.argv) == 4 and sys.argv[1] == 'worker':
        worker(job_path(sys.argv[2]), validate_url(sys.argv[3]))
        return
    if len(sys.argv) == 6 and sys.argv[1] == 'download-worker':
        resolution = int(sys.argv[5])
        if not 0 <= resolution <= 4320:
            raise ValueError('Invalid video resolution')
        download_worker(job_path(sys.argv[2]), validate_url(sys.argv[3]), sys.argv[4], resolution)
        return
    try:
        message = receive()
        if message is None:
            return
        response = handle(message)
    except Exception as error:
        response = {'ok': False, 'error': str(error)[:180]}
    data = json.dumps(response).encode('utf-8')
    sys.stdout.buffer.write(struct.pack('<I', len(data)) + data)
    sys.stdout.buffer.flush()


if __name__ == '__main__':
    main()
