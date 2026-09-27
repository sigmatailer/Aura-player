const fs = require('fs');
const path = require('path');

function findFiles(dir, filter, fileList = []) {
  if (!fs.existsSync(dir)) return fileList;
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    if (fs.statSync(fullPath).isDirectory()) {
      findFiles(fullPath, filter, fileList);
    } else if (filter.test(file)) {
      fileList.push(fullPath);
    }
  }
  return fileList;
}

const appDelegates = findFiles('src-tauri/gen/apple', /AppDelegate\.swift$/);
for (const file of appDelegates) {
  let content = fs.readFileSync(file, 'utf8');
  if (!content.includes('AVFoundation')) {
    content = 'import AVFoundation\n' + content;
  }
  if (!content.includes('setCategory')) {
    const sessionCode = `
        do {
            let session = AVAudioSession.sharedInstance()
            try session.setCategory(.playback, mode: .default, options: [])
            try session.setActive(true)
        } catch {
            print("Failed to set AVAudioSession category: \\(error)")
        }
`;
    content = content.replace(/func application\([^{]+\{/, (match) => match + sessionCode);
  }
  fs.writeFileSync(file, content, 'utf8');
  console.log('Successfully injected AVAudioSession into', file);
}

const plists = findFiles('src-tauri/gen/apple', /Info\.plist$/);
for (const file of plists) {
  let content = fs.readFileSync(file, 'utf8');
  if (!content.includes('UIBackgroundModes')) {
    const bgModes = `
	<key>UIBackgroundModes</key>
	<array>
		<string>audio</string>
	</array>
</dict>
</plist>`;
    content = content.replace(/<\/dict>\s*<\/plist>/, bgModes);
    fs.writeFileSync(file, content, 'utf8');
    console.log('Successfully injected UIBackgroundModes into', file);
  }
}

// Update iOS AppIcon in Assets.xcassets
const iconSets = [];
function findDirs(dir, filter) {
  if (!fs.existsSync(dir)) return;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (filter.test(entry.name)) {
        iconSets.push(full);
      } else {
        findDirs(full, filter);
      }
    }
  }
}

findDirs('src-tauri/gen/apple', /AppIcon\.appiconset$/);
for (const iconSetDir of iconSets) {
  console.log('Updating iOS AppIcon in:', iconSetDir);
  const iosIconsDir = path.join('src-tauri', 'icons', 'ios');
  if (fs.existsSync(iosIconsDir)) {
    const iconFiles = fs.readdirSync(iosIconsDir);
    for (const f of iconFiles) {
      if (f.endsWith('.png')) {
        fs.copyFileSync(path.join(iosIconsDir, f), path.join(iconSetDir, f));
      }
    }
  }
  const masterIcon = fs.existsSync('app-icon.png') ? 'app-icon.png' : path.join('src-tauri', 'icons', 'ios', 'AppIcon-512@2x.png');
  if (fs.existsSync(masterIcon)) {
    fs.copyFileSync(masterIcon, path.join(iconSetDir, 'AppIcon-512@2x.png'));
    fs.copyFileSync(masterIcon, path.join(iconSetDir, 'icon-512@2x.png'));
    const existingFiles = fs.readdirSync(iconSetDir);
    for (const f of existingFiles) {
      if (f.endsWith('.png') && f.startsWith('icon-')) {
        fs.copyFileSync(masterIcon, path.join(iconSetDir, f));
      }
    }
  }
  console.log('Successfully updated AppIcon.appiconset in', iconSetDir);
}

