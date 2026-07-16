#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');

const skillDir = path.join(os.homedir(), '.claude', 'skills', 'ontograph');
const srcDir = __dirname;

try {
  fs.mkdirSync(skillDir, { recursive: true });
  fs.copyFileSync(path.join(srcDir, 'SKILL.md'), path.join(skillDir, 'SKILL.md'));
  fs.rmSync(path.join(skillDir, 'detail.py'), { force: true });
  console.log('[ontograph] Claude Code skill installed →', skillDir);
} catch (_) {
  // Non-fatal — Claude Code may not be installed
}
