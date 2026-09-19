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

