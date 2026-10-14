import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

import install as installer


class InstallTest(unittest.TestCase):
    def test_user_level_manifest_and_copy(self):
        with tempfile.TemporaryDirectory() as temp, \
             patch.object(installer.Path, 'home', return_value=Path(temp)), \
             patch.object(installer.sys, 'platform', 'linux'):
            manifest = installer.install('a' * 32)
            data = json.loads(manifest.read_text(encoding='utf-8'))
            self.assertEqual(data['name'], installer.NAME)
            self.assertEqual(data['allowed_origins'], [f'chrome-extension://{"a" * 32}/'])
            self.assertTrue(Path(data['path']).is_file())
            self.assertTrue((manifest.parent / 'lexihalo_asr.py').is_file())
            self.assertTrue((manifest.parent / 'media_sites.py').is_file())
            platforms = json.loads((manifest.parent / 'media-platforms.json').read_text(encoding='utf-8'))
            self.assertEqual(len(platforms), 32)
            self.assertEqual(len([entry for entry in platforms if entry['mode'] == 'browser']), 19)
            self.assertNotIn(str(Path(__file__).parent.resolve()), Path(data['path']).read_text(encoding='utf-8'))

    def test_rejects_invalid_extension_id(self):
        with self.assertRaises(ValueError):
            installer.install('../not-an-extension-id')


if __name__ == '__main__':
    unittest.main()
