import base64
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

import lexihalo_asr as host


class NativeAsrTest(unittest.TestCase):
    def test_url_allowlist(self):
        valid = 'https://www.youtube.com/watch?v=abcdefghijk'
        self.assertEqual(host.validate_url(valid), valid)
        pornhub = 'https://www.pornhub.com/view_video.php?viewkey=ph123abc'
        self.assertEqual(host.validate_url(pornhub), pornhub)
        for address in ('http://www.youtube.com/watch?v=abcdefghijk',
                        'https://127.0.0.1/', 'https://www.youtube.com/redirect?url=https://example.com',
                        'https://www.bilibili.com/', 'https://vimeo.com/channels/staffpicks',
                        'https://www.ted.com/about', 'https://www.pornhub.com/view_video.php',
                        'file:///etc/passwd'):
            with self.subTest(address=address), self.assertRaises(ValueError):
                host.validate_url(address)
        generic = 'https://media.example.com/watch/lesson?episode=2'
        public_answer = [(host.socket.AF_INET, host.socket.SOCK_STREAM, 6, '', ('93.184.216.34', 443))]
        with patch.object(host.socket, 'getaddrinfo', return_value=public_answer):
            self.assertEqual(host.validate_url(generic), generic)
        private_answer = [(host.socket.AF_INET, host.socket.SOCK_STREAM, 6, '', ('192.168.1.10', 443))]
        with patch.object(host.socket, 'getaddrinfo', return_value=private_answer), self.assertRaises(ValueError):
            host.validate_url(generic)

    def test_worker_offsets_and_cleanup(self):
        with tempfile.TemporaryDirectory() as temp, patch.object(host, 'ROOT', Path(temp)):
            directory = host.job_path('b' * 32)
            directory.mkdir()
            def fake_run(command, folder, stage):
                if stage == '下载音频':
                    (folder / 'source.webm').write_bytes(b'example media')
                else:
                    (folder / 'part-000.wav').write_bytes(b'RIFF' + b'one' * 20)
                    (folder / 'part-001.wav').write_bytes(b'RIFF' + b'two' * 20)
                    (folder / 'segments.csv').write_text(f'{folder / "part-000.wav"},0.000,50.000\n{folder / "part-001.wav"},50.000,100.000\n')
            def fake_probe(command, **_kwargs):
                class Result:
                    stdout = '100.0' if 'source.webm' in command[-1] else '50.0'
                return Result()
            with patch.object(host.shutil, 'which', return_value='/bin/tool'), \
                 patch.object(host, 'run', side_effect=fake_run), \
                 patch.object(host.subprocess, 'run', side_effect=fake_probe):
                host.worker(directory, 'https://www.youtube.com/watch?v=abcdefghijk')
            self.assertEqual(host.state(directory)['offsets'], [0.0, 50.0])
            self.assertFalse((directory / 'source.webm').exists())

    def test_format_listing_is_sanitized_and_sorted(self):
        payload = {
            'title': 'Example', 'duration': 120,
            'formats': [
                {'format_id': '18', 'width': 640, 'height': 360, 'fps': 30, 'ext': 'mp4',
                 'vcodec': 'avc1', 'acodec': 'aac', 'filesize': 1000},
                {'format_id': '137', 'width': 1920, 'height': 1080, 'fps': 30, 'ext': 'mp4',
                 'vcodec': 'avc1', 'acodec': 'none', 'filesize_approx': 2000, 'tbr': 4000},
                {'format_id': '299', 'width': 1920, 'height': 1080, 'fps': 60, 'ext': 'mp4',
                 'vcodec': 'avc1', 'acodec': 'none', 'filesize_approx': 1800, 'tbr': 3000},
                {'format_id': 'direct-720', 'width': None, 'height': 720, 'fps': None, 'ext': 'mp4',
                 'vcodec': None, 'acodec': None, 'url': 'https://cdn.example/video_720p.mp4'},
                {'format_id': 'audio', 'ext': 'm4a', 'vcodec': 'none', 'acodec': 'aac'},
            ],
        }
        class Result:
            stdout = json.dumps(payload)
        with patch.object(host, 'find_tool', return_value='/bin/yt-dlp'), \
             patch.object(host.subprocess, 'run', return_value=Result()):
            result = host.inspect_formats('https://www.youtube.com/watch?v=abcdefghijk')
        self.assertEqual([item['formatId'] for item in result['formats']], ['299', 'direct-720', '18', 'audio'])
        self.assertEqual(result['formats'][0]['label'], '1080p · 60fps')
        self.assertFalse(result['formats'][0]['hasAudio'])
        self.assertTrue(result['formats'][1]['hasAudio'])
        self.assertEqual(result['formats'][1]['vcodec'], 'unknown')
        self.assertTrue(result['formats'][2]['hasAudio'])
        self.assertTrue(result['formats'][3]['isAudio'])
        self.assertEqual(result['formats'][3]['resolution'], 0)

    def test_video_download_moves_completed_file(self):
        with tempfile.TemporaryDirectory() as temp, patch.object(host, 'ROOT', Path(temp) / 'jobs'), \
             patch.object(host, 'DOWNLOAD_ROOT', Path(temp) / 'downloads'):
            directory = host.ROOT / ('c' * 32)
            directory.mkdir(parents=True)
            metadata = {'title': 'Example', 'duration': 60, 'formats': [
                {'formatId': '137', 'label': '1080p · MP4', 'hasAudio': False}
            ]}
            def fake_run(command, folder, _stage, expected_parts):
                self.assertTrue(any('bestvideo[height=1080]+bestaudio' in arg for arg in command))
                self.assertEqual(expected_parts, 2)
                (folder / 'Example [abcdefghijk] [1080p].mp4').write_bytes(b'video')
            with patch.object(host, 'find_tool', return_value='/bin/tool'), \
                 patch.object(host, 'inspect_formats', return_value=metadata), \
                 patch.object(host, 'run_download', side_effect=fake_run):
                host.download_worker(directory, 'https://www.youtube.com/watch?v=abcdefghijk', '137', 1080)
            status = host.state(directory)
            self.assertEqual(status['state'], 'ready')
            self.assertTrue((host.DOWNLOAD_ROOT / status['filename']).is_file())

    def test_download_strategy_registry(self):
        audio = host.resolve_download_strategy('https://soundcloud.com/a/b', {'isAudio': True}, 0)
        pornhub = host.resolve_download_strategy('https://www.pornhub.com/view_video.php?viewkey=x', {'hasAudio': True}, 720)
        muxed = host.resolve_download_strategy('https://example.com/watch', {'hasAudio': True}, 720)
        split = host.resolve_download_strategy('https://example.com/watch', {'hasAudio': False}, 1080)
        self.assertEqual([audio['name'], pornhub['name'], muxed['name'], split['name']],
                         ['audio', 'pornhub-hls', 'muxed-video', 'split-video-audio'])
        self.assertEqual(pornhub['attempts'], 5)
        self.assertEqual(split['expected_parts'], 2)

    def test_video_download_uses_stable_resolution_for_unstable_hls_id(self):
        with tempfile.TemporaryDirectory() as temp, patch.object(host, 'ROOT', Path(temp) / 'jobs'), \
             patch.object(host, 'DOWNLOAD_ROOT', Path(temp) / 'downloads'):
            directory = host.ROOT / ('d' * 32)
            directory.mkdir(parents=True)
            metadata = {'title': 'Example', 'duration': 60, 'formats': [
                {'formatId': 'hls-378', 'resolution': 240, 'label': '240p', 'hasAudio': True}
            ]}
            calls = []
            def fake_run(command, folder, _stage, expected_parts):
                calls.append(command)
                selector = command[command.index('-f') + 1]
                self.assertIn('best[height=240][protocol^=m3u8]', selector)
                self.assertNotIn('best[height=240]/', selector)
                self.assertNotIn('hls-378', command)
                self.assertNotIn('hls-377', command)
                self.assertIn('https://www.pornhub.com/', command)
                self.assertTrue(any('accessAgeDisclaimerPH=2' in arg for arg in command))
                self.assertEqual(expected_parts, 1)
                (folder / 'Example [id] [240p].mp4').write_bytes(b'video')
            with patch.object(host, 'find_tool', return_value='/bin/tool'), \
                 patch.object(host, 'inspect_formats', return_value=metadata), \
                 patch.object(host, 'run_download', side_effect=fake_run):
                host.download_worker(directory, 'https://www.pornhub.com/view_video.php?viewkey=ph123abc',
                                     'hls-377', 240)
            self.assertEqual(host.state(directory)['state'], 'ready')
            self.assertEqual(len(calls), 1)

    def test_pornhub_download_reuses_cached_hls_info_without_reextracting_page(self):
        with tempfile.TemporaryDirectory() as temp, patch.object(host, 'ROOT', Path(temp) / 'jobs'), \
             patch.object(host, 'DOWNLOAD_ROOT', Path(temp) / 'downloads'):
            url = 'https://www.pornhub.com/view_video.php?viewkey=ph123abc'
            info = {'id': 'ph123abc', 'title': 'Example', 'duration': 60, 'formats': [{
                'format_id': 'hls-2250', 'protocol': 'm3u8_native', 'height': 720, 'width': 1280,
                'ext': 'mp4', 'vcodec': 'avc1.64001f', 'acodec': 'mp4a.40.2', 'tbr': 2250,
                'url': 'https://cdn.example/master.m3u8',
            }]}
            host.save_format_cache(url, info)
            directory = host.ROOT / ('8' * 32)
            directory.mkdir(parents=True)
            def fake_run(command, folder, _stage, _expected_parts):
                self.assertIn('--load-info-json', command)
                self.assertEqual(command[command.index('-f') + 1], 'hls-2250')
                self.assertNotIn(url, command)
                (folder / 'Example [ph123abc] [720p].mp4').write_bytes(b'video')
            with patch.object(host, 'find_tool', return_value='/bin/tool'), \
                 patch.object(host, 'inspect_formats', side_effect=AssertionError('page must not be re-extracted')), \
                 patch.object(host, 'run_download', side_effect=fake_run):
                host.download_worker(directory, url, 'hls-2250', 720)
            self.assertEqual(host.state(directory)['state'], 'ready')

    def test_pornhub_hls_reextracts_after_temporary_410(self):
        with tempfile.TemporaryDirectory() as temp, patch.object(host, 'ROOT', Path(temp) / 'jobs'), \
             patch.object(host, 'DOWNLOAD_ROOT', Path(temp) / 'downloads'):
            directory = host.ROOT / ('9' * 32)
            directory.mkdir(parents=True)
            metadata = {'title': 'Example', 'duration': 60, 'formats': [
                {'formatId': '720p', 'resolution': 720, 'label': '720p', 'hasAudio': True}
            ]}
            calls = 0
            def flaky_run(_command, folder, _stage, _expected_parts):
                nonlocal calls
                calls += 1
                if calls < 3:
                    (folder / 'stale.part').write_bytes(b'partial')
                    raise RuntimeError('Requested format is not available after HTTP Error 410')
                self.assertFalse((folder / 'stale.part').exists())
                (folder / 'Example [id] [720p].mp4').write_bytes(b'video')
            with patch.object(host, 'find_tool', return_value='/bin/tool'), \
                 patch.object(host, 'inspect_formats', return_value=metadata), \
                 patch.object(host, 'run_download', side_effect=flaky_run), \
                 patch.object(host.time, 'sleep'):
                host.download_worker(directory, 'https://www.pornhub.com/view_video.php?viewkey=ph123abc',
                                     '720p', 720)
            self.assertEqual(calls, 3)
            self.assertEqual(host.state(directory)['state'], 'ready')

    def test_download_failure_includes_yt_dlp_error(self):
        with tempfile.TemporaryDirectory() as temp:
            directory = Path(temp)
            (directory / 'status.json').write_text('{}')
            class Stdout:
                def __iter__(self):
                    return iter(['[download] starting\n', 'ERROR: HTTP Error 403: Forbidden\n'])
            class Process:
                stdout = Stdout()
                returncode = 1
                def poll(self): return self.returncode
                def kill(self): pass
                def wait(self, timeout=None): return self.returncode
            with patch.object(host.subprocess, 'Popen', return_value=Process()):
                with self.assertRaisesRegex(RuntimeError, '403: Forbidden'):
                    host.run_download(['yt-dlp'], directory, '下载视频', 1)

    def test_browser_audio_import_is_ordered_bounded_and_local(self):
        with tempfile.TemporaryDirectory() as temp, patch.object(host, 'ROOT', Path(temp)):
            started = host.handle({'action': 'beginUpload',
                'url': 'https://cn.pornhub.com/view_video.php?viewkey=ph123abc'})
            job = started['jobId']
            part = base64.b64encode(b'RIFF0000WAVE!').decode('ascii')
            response = host.handle({'action': 'uploadPart', 'jobId': job, 'sequence': 0, 'data': part})
            self.assertEqual(response['bytes'], 13)
            with self.assertRaises(ValueError):
                host.handle({'action': 'uploadPart', 'jobId': job, 'sequence': 0, 'data': part})
            with self.assertRaises(ValueError):
                host.handle({'action': 'sealUpload', 'jobId': job, 'sequence': 1, 'total': 12})
            with patch.object(host.subprocess, 'Popen') as spawn:
                host.handle({'action': 'sealUpload', 'jobId': job, 'sequence': 1, 'total': 13})
                self.assertIn('import-worker', spawn.call_args.args[0])
                self.assertNotIn('yt-dlp', ' '.join(spawn.call_args.args[0]))
            def fake_run(command, folder, stage):
                self.assertNotIn('下载音频', stage)
                self.assertIn('file,pipe', command)
                (folder / 'part-000.wav').write_bytes(b'RIFF' + b'pcm' * 20)
                (folder / 'segments.csv').write_text(f'{folder / "part-000.wav"},0.000,10.000\n')
            class Probe:
                stdout = '10'
            with patch.object(host, 'find_tool', return_value='/bin/tool'), \
                 patch.object(host, 'run', side_effect=fake_run), \
                 patch.object(host.subprocess, 'run', return_value=Probe()):
                host.worker(host.job_path(job), '', imported=True)
            self.assertEqual(host.state(host.job_path(job))['state'], 'ready')
            self.assertFalse((host.job_path(job) / 'source.bin').exists())
            host.handle({'action': 'finish', 'jobId': job})
            self.assertFalse(host.job_path(job).exists())

    def test_browser_audio_cancel_and_invalid_parts(self):
        with tempfile.TemporaryDirectory() as temp, patch.object(host, 'ROOT', Path(temp)):
            job = host.handle({'action': 'beginUpload',
                'url': 'https://cn.pornhub.com/view_video.php?viewkey=ph123abc'})['jobId']
            with self.assertRaises(ValueError):
                host.handle({'action': 'uploadPart', 'jobId': job, 'sequence': 0, 'data': '!!'})
            with self.assertRaises(ValueError):
                host.handle({'action': 'uploadPart', 'jobId': job, 'sequence': 0,
                    'data': 'A' * (host.MAX_UPLOAD_PART * 4 // 3 + 4)})
            host.handle({'action': 'cancel', 'jobId': job})
            self.assertFalse(host.job_path(job).exists())

    def test_imported_download_merges_audio_without_network(self):
        with tempfile.TemporaryDirectory() as temp, patch.object(host, 'ROOT', Path(temp) / 'jobs'), \
             patch.object(host, 'DOWNLOAD_ROOT', Path(temp) / 'downloads'):
            directory = host.ROOT / ('e' * 32)
            directory.mkdir(parents=True)
            (directory / 'source.bin').write_bytes(bytes.fromhex('000000106674797069736f6d'))
            (directory / 'source-audio.bin').write_bytes(b'RIFF0000WAVEabcd')
            class Probe:
                stdout = json.dumps({'format': {'duration': 10}, 'streams': [{'codec_type': 'video'}]})
            def fake_run(command, folder, _stage):
                self.assertEqual(command.count('-i'), 2)
                self.assertIn('1:a:0', command)
                self.assertIn('file,pipe', command)
                Path(command[-1]).write_bytes(b'completed resource')
            with patch.object(host, 'find_tool', return_value='/bin/tool'), \
                 patch.object(host.subprocess, 'run', return_value=Probe()), \
                 patch.object(host, 'run', side_effect=fake_run):
                host.imported_download_worker(directory, {'title': '../unsafe/title', 'ext': 'mkv', 'isAudio': False})
            status = host.state(directory)
            self.assertEqual(status['state'], 'ready')
            self.assertNotIn('/', status['filename'])
            self.assertTrue((host.DOWNLOAD_ROOT / status['filename']).is_file())
            self.assertFalse((directory / 'source.bin').exists())
            self.assertFalse((directory / 'source-audio.bin').exists())

    def test_imported_mp3_request_transcodes_incompatible_audio_codec(self):
        with tempfile.TemporaryDirectory() as temp, patch.object(host, 'ROOT', Path(temp) / 'jobs'), \
             patch.object(host, 'DOWNLOAD_ROOT', Path(temp) / 'downloads'):
            directory = host.ROOT / ('7' * 32)
            directory.mkdir(parents=True)
            (directory / 'source.bin').write_bytes(bytes.fromhex('1a45dfa3') + b'webm')
            class Probe:
                stdout = json.dumps({'format': {'duration': 10}, 'streams': [
                    {'codec_type': 'audio', 'codec_name': 'opus'},
                ]})
            def fake_run(command, folder, _stage):
                self.assertIn('libmp3lame', command)
                self.assertNotIn('copy', command)
                self.assertEqual(Path(command[-1]).suffix, '.mp3')
                Path(command[-1]).write_bytes(b'mp3 output')
            with patch.object(host, 'find_tool', return_value='/bin/tool'), \
                 patch.object(host.subprocess, 'run', return_value=Probe()), \
                 patch.object(host, 'run', side_effect=fake_run):
                host.imported_download_worker(directory, {'title': 'Audio', 'ext': 'mp3', 'isAudio': True})
            status = host.state(directory)
            self.assertEqual(status['state'], 'ready')
            self.assertTrue(status['filename'].endswith('.mp3'))

    def test_audio_resource_format_and_download(self):
        info = {'title': 'Audio', 'duration': 10, 'formats': [
            {'format_id': 'audio', 'vcodec': 'none', 'acodec': 'aac', 'ext': 'm4a', 'abr': 128}
        ]}
        class Probe:
            stdout = json.dumps(info)
        with patch.object(host, 'find_tool', return_value='/bin/tool'), \
             patch.object(host.subprocess, 'run', return_value=Probe()):
            formats = host.inspect_formats('https://soundcloud.com/artist/track')['formats']
        self.assertEqual(len(formats), 1)
        self.assertTrue(formats[0]['isAudio'])
        self.assertEqual(formats[0]['resolution'], 0)

    def test_two_stream_upload_is_ordered(self):
        with tempfile.TemporaryDirectory() as temp, patch.object(host, 'ROOT', Path(temp)):
            job = host.handle({'action': 'beginUpload', 'purpose': 'download',
                'url': 'https://cn.pornhub.com/view_video.php?viewkey=ph123abc'})['jobId']
            host.handle({'action': 'uploadPart', 'jobId': job, 'sequence': 0, 'stream': 'media', 'data': 'YQ=='})
            reply = host.handle({'action': 'uploadPart', 'jobId': job, 'sequence': 1, 'stream': 'audio', 'data': 'Yg=='})
            self.assertEqual(reply['bytes'], 2)
            self.assertEqual((host.job_path(job) / 'source-audio.bin').read_bytes(), b'b')
            with patch.object(host.subprocess, 'Popen'):
                host.handle({'action': 'sealUpload', 'jobId': job, 'sequence': 2, 'total': 2})
            metadata = json.loads((host.job_path(job) / 'import.json').read_text())
            self.assertEqual(metadata['purpose'], 'download')

    def test_import_rejects_playlists_and_file_references(self):
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp) / 'source.bin'
            for data in (b'#EXTM3U\nfile:///private/audio.wav', b'ffconcat version 1.0\nfile secret.wav', b'<MPD>'):
                path.write_bytes(data)
                with self.assertRaises(RuntimeError):
                    host.validate_imported_container(path)

    def test_jpeg_wrapped_ts_segment_is_strictly_normalized(self):
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp) / 'segment.bin'
            packet = bytes([0x47, 0x40, 0x11, 0x10]) + bytes(184)
            transport = packet * 8
            path.write_bytes(b'\xff\xd8fixture-jpeg\xff\xd9' + transport)
            self.assertEqual(host.validate_imported_container(path, normalize=True), 'ts')
            self.assertEqual(path.read_bytes(), transport)
            for invalid in (
                b'\xff\xd8ordinary-image\xff\xd9' + bytes(188 * 3),
                b'\xff\xd8no-jpeg-end' + transport,
                b'prefix' + transport,
                b'\xff\xd8fixture-jpeg\xff\xd9' + transport[:-1],
            ):
                path.write_bytes(invalid)
                with self.assertRaisesRegex(RuntimeError, '不是支持的媒体字节'):
                    host.validate_imported_container(path, normalize=True)

    def test_hls_import_preserves_discontinuity_in_generated_local_playlist(self):
        with tempfile.TemporaryDirectory() as temp, patch.object(host, 'ROOT', Path(temp)):
            job = host.handle({'action': 'beginUpload', 'siteId': 'generic', 'purpose': 'download'})['jobId']
            media = b'RIFF0000WAVEtest'
            for index in range(2):
                host.handle({'action': 'uploadPart', 'jobId': job, 'sequence': index,
                    'data': base64.b64encode(media).decode(), 'entry': {
                        'index': index, 'kind': 'segment', 'duration': 5,
                        'discontinuity': index == 1, 'map': None,
                    }})
            with patch.object(host.subprocess, 'Popen'):
                host.handle({'action': 'sealUpload', 'jobId': job, 'total': len(media) * 2, 'sequence': 2})
            manifest = (host.job_path(job) / 'media.m3u8').read_text()
            self.assertIn('#EXT-X-DISCONTINUITY', manifest)
            self.assertIn('media-00001.wav', manifest)
            self.assertNotIn('http', manifest)
            self.assertEqual(host.import_source(host.job_path(job)).name, 'media.m3u8')
            self.assertIn('ALL', host.local_input_options(host.import_source(host.job_path(job))))
            host.cleanup_import_sources(host.job_path(job))
            self.assertFalse((host.job_path(job) / 'media-00000.bin').exists())

    def test_download_progress_parser(self):
        parsed = host.parse_download_progress(
            '[download] LEXIHALO_PROGRESS| 42.5%| 3.2MiB/s| 00:12'
        )
        self.assertEqual(parsed['percent'], 42.5)
        self.assertEqual(parsed['speed'], '3.2MiB/s')
        self.assertEqual(parsed['eta'], '00:12')
        self.assertIsNone(host.parse_download_progress('[download] ordinary output'))

    def test_bounded_chunk_and_cancel(self):
        with tempfile.TemporaryDirectory() as temp, patch.object(host, 'ROOT', Path(temp)):
            task = 'a' * 32
            directory = host.job_path(task)
            directory.mkdir()
            chunk = b'RIFF' + b'fake pcm bytes' * 50
            (directory / 'part-000.wav').write_bytes(chunk)
            host.save(directory / 'status.json', {'state': 'ready', 'count': 1, 'offsets': [0],
                                                   'sizes': [len(chunk)], 'duration': 10})
            with patch.object(host, 'MAX_MESSAGE_AUDIO', 100):
                answers = [host.handle({'action': 'chunkPart', 'jobId': task, 'index': 0, 'part': part})
                           for part in range((len(chunk) + 99) // 100)]
            self.assertEqual(b''.join(base64.b64decode(answer['audio']) for answer in answers), chunk)
            self.assertFalse(answers[0]['done'])
            self.assertTrue(answers[-1]['done'])
            with self.assertRaises(ValueError):
                host.handle({'action': 'chunkPart', 'jobId': task, 'index': -1, 'part': 0})
            host.handle({'action': 'cancel', 'jobId': task})
            with self.assertRaises(ValueError):
                host.handle({'action': 'chunkPart', 'jobId': task, 'index': 0, 'part': 0})


if __name__ == '__main__':
    unittest.main()
