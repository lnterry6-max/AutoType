# AutoType installed web app (PWA)

AutoType is installable at https://auto-type.net/. It uses the same website and Supabase backend.

## Installation
- iPhone/iPad: Safari → Share → Add to Home Screen → enable **Open as Web App** if offered → Add.
- Android: Chrome → menu → **Install app** or **Add to Home screen** → confirm.
- Players can open /install.html for device instructions. A native install prompt is offered only when the browser makes it available and the player taps Install.

## Standalone design
- User's original `assets/logo.png` wordmark, cropped to its alpha bounds and resized without alteration, centered on white in new square PNG icon assets; standalone app window.
- Compact four-item dock for installed mobile browse pages; **never shown during active matches, Plinko, messaging, account recovery, admin or the keyboard-heavy pages**.
- Normal browser visitors see no dock or automatic install pop-up.
- Home and footer link to the installation guide.

## Network and security
- The service worker is now **pass-through** and has no fetch handler. Safari/Chrome handle all navigation requests directly; the older fallback could falsely report a network outage on iOS.
- It caches **nothing**, and its activation removes the previously cached offline fallback.
- The browser fetches current pages normally, without a worker-supplied offline screen.
- Live gameplay and backend syncing require an internet connection.
- Installed mode can have separate browser storage; signed-in players might need to log in again. Local-only guest data isn't promised to carry over.
- This is not a native App Store application.

## Testing
Check installation, the app icon, opening directly to Home, clicking Play, sign-in and password reset, mobile typing keyboard, dock hiding in game, and offline/online recovery on physical iPhone and Android devices.

## v2 fixes
- Native app navigation stays available throughout Home, Play selection, rankings, social and informational tabs. Hidden while a Play match is active or text fields are focused; also hidden from Plinko and account screens.
- In standalone mode, the homepage install CTA, installer guide, and install footer links are suppressed.
- Old iOS offline fallback interception has been retired and its cache is cleaned.
- After changing a Home Screen icon on iOS, remove the previously installed Home Screen shortcut and add it again to see the updated icon.

## v3 (mobile/browser separation)
- The original transparent wordmark remains in `assets/logo.png`; both site header and homepage install teaser show it on a **white rounded background**, visually cropped with CSS (no replacement artwork).
- The iOS/Android icon URLs are versioned to v3 to invalidate old Home Screen and favicon caches; they reference the original-logo icons, not the obsolete A-only icon.
- Install invitations are **hidden by default** and only shown when `pwa.js` confirms a mobile Safari/Chrome browser. The normal desktop site and the installed app never display these invitations.
- Direct desktop visits to `/install.html` show a desktop-appropriate explanation and hide the mobile step-by-step installation guides.
- App dock and service worker remain independent of ordinary desktop browsing.
