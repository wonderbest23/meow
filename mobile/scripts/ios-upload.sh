#!/bin/sh
# 아이폰 앱을 App Store Connect 에 올린다.
#
# 이 맥의 Xcode 에 로그인한 개발자 계정(팀 79LFPKSH3X)으로 서명한다. 앱스토어 배포 인증서는 애플 클라우드가 관리한다.
# 팀에 등록된 아이폰이 없어서 개발용 서명으로는 아카이브할 수 없다. 그래서 순서가 이렇다:
#   1. 서명 없이 아카이브한다.
#   2. 애플 로그인 권한(App.entitlements)을 임시 서명으로 넣는다. 넣지 않으면 배포 서명에서 이 권한이 빠진다.
#   3. 배포 서명으로 내보내면서 올린다.
#
# 올리기 전에 project.pbxproj 의 CURRENT_PROJECT_VERSION(빌드 번호)을 1 올려야 한다. 같은 번호는 다시 올릴 수 없다.
set -eu
cd "$(dirname "$0")/../ios/App"

TEAM=79LFPKSH3X
ARCHIVE=build/App.xcarchive

rm -rf "$ARCHIVE" build/upload
xcodebuild -project App.xcodeproj -scheme App -configuration Release \
  -destination 'generic/platform=iOS' -archivePath "$ARCHIVE" \
  DEVELOPMENT_TEAM="$TEAM" CODE_SIGNING_ALLOWED=NO archive -quiet

codesign --force --sign - --entitlements App/App.entitlements --generate-entitlement-der \
  "$ARCHIVE/Products/Applications/App.app"

cat > build/ExportUpload.plist <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>method</key><string>app-store-connect</string>
<key>destination</key><string>upload</string>
<key>teamID</key><string>$TEAM</string>
<key>signingStyle</key><string>automatic</string>
<key>uploadSymbols</key><true/>
</dict></plist>
EOF

xcodebuild -exportArchive -archivePath "$ARCHIVE" -exportOptionsPlist build/ExportUpload.plist \
  -exportPath build/upload -allowProvisioningUpdates
