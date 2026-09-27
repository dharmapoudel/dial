// Dial settings page. Runs on the PHONE inside the companion app.
// Reads/writes the manifest config keys via @bridgething/client/settings.
import { settings } from '@bridgething/client/settings';

const statusEl = document.getElementById('status');
const boxes = {
  dj_voice: document.getElementById('cfg-dj_voice'),
  haptics: document.getElementById('cfg-haptics'),
};

function say(text, kind) {
  statusEl.textContent = text;
  statusEl.dataset.kind = kind || '';
}

async function load() {
  for (const [key, box] of Object.entries(boxes)) {
    try {
      const v = await settings.config.get(key);
      // Stored as strings by the config surface; manifest default is true.
      box.checked = v === null || v === undefined ? true : v !== 'false' && v !== false;
    } catch {
      box.checked = true;
    }
    box.addEventListener('change', save);
  }
  say('Loaded.', 'ok');
}

let saveTimer = null;
async function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    try {
      for (const [key, box] of Object.entries(boxes)) {
        await settings.config.set(key, box.checked ? 'true' : 'false');
      }
      say('Saved.', 'ok');
    } catch (e) {
      say('Save failed: ' + (e && e.message ? e.message : e), 'err');
    }
  }, 250);
}

load();
