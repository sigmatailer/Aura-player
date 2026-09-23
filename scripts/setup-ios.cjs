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

// 1. Inject background audio capability into AppDelegate.swift
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

// 2. Inject UIBackgroundModes into Info.plist
const plists = findFiles('src-tauri/gen/apple', /Info\.plist$/);
for (const file of plists) {
  let modified = false;
  if (!content.includes('UIBackgroundModes')) {
    const bgModes = `
	<key>UIBackgroundModes</key>
	<array>
		<string>audio</string>
	</array>
</dict>
</plist>`;
    content = content.replace(/<\/dict>\s*<\/plist>/, bgModes);
    modified = true;
    console.log('Successfully injected UIBackgroundModes into', file);
  }
  if (!content.includes('NSAppTransportSecurity')) {
    const ats = `
	<key>NSAppTransportSecurity</key>
	<dict>
		<key>NSAllowsArbitraryLoads</key>
		<true/>
	</dict>
</dict>
</plist>`;
    content = content.replace(/<\/dict>\s*<\/plist>/, ats);
    modified = true;
    console.log('Successfully injected NSAppTransportSecurity into', file);
  }
  if (modified) {
    fs.writeFileSync(file, content, 'utf8');
  }
}

// 3. Fix Xcode project compatibility & disable code signing requirement for CI
const pbxprojects = findFiles('src-tauri/gen/apple', /project\.pbxproj$/);
for (const file of pbxprojects) {
  let content = fs.readFileSync(file, 'utf8');

  // Convert future Xcode format 77 to format 56 (Xcode 14/15/16 universal compatibility)
  if (content.includes('objectVersion = 77;')) {
    content = content.replace(/objectVersion = 77;/g, 'objectVersion = 56;');
    console.log('Adjusted objectVersion from 77 to 56 in', file);
  }

  // Disable code signing requirements for unsigned IPA build
  content = content.replace(/CODE_SIGN_STYLE = Automatic;/g, 'CODE_SIGN_STYLE = Manual;');
  content = content.replace(/CODE_SIGN_IDENTITY = "[^"]*";/g, 'CODE_SIGN_IDENTITY = "";');
  content = content.replace(/DEVELOPMENT_TEAM = [^;]*;/g, 'DEVELOPMENT_TEAM = "";');

  if (!content.includes('CODE_SIGNING_REQUIRED = NO;')) {
    content = content.replace(/buildSettings = \{/g, 'buildSettings = {\n\t\t\t\tCODE_SIGNING_REQUIRED = NO;\n\t\t\t\tCODE_SIGNING_ALLOWED = NO;\n\t\t\t\tCODE_SIGN_IDENTITY = "";');
  }

  fs.writeFileSync(file, content, 'utf8');
  console.log('Configured signing buildSettings in', file);
}
