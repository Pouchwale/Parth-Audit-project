# The whole application on one server PC, and Mitra on the phones

How to set up the plant's server PC so that laptops and desktops use DCRS in a browser and staff phones
(Android and iPhone) use Mitra in the Expo Go app. Do the steps in order. Every command is typed in
PowerShell, in the DCRS folder, unless the step says otherwise.

## 1. The picture

- **One server PC** on the company network runs everything:
  - **DCRS** on port **4000**. Laptops and desktops open `http://<server address>:4000` in a browser.
  - **The Mitra server** on port **3000**. The Mitra app on the phones talks to it, and it talks to DCRS
    as the person signed in, so DCRS's departments, working hours and rules apply on the phone too.
  - **Mitra for Expo Go** on port **8081**. Phones open Mitra in Expo Go from `exp://<server address>:8081`.
    Nothing is installed or built for the phones: no APK, no TestFlight.
- **One folder** holds it all: the DCRS folder, with the Mitra app in `Audit project chatbot-mobile` inside it
  (its server in `server\`, the phone app in `mobile\`).
- The phone finds the Mitra server by itself: port 3000 on the computer it loaded the app from.

## 2. Send this to your IT person

> Please set up the PC that runs DCRS and Mitra (the "server PC"):
>
> 1. **A fixed address.** Reserve its address in the router's DHCP (by the MAC address of its network card), so it
>    never changes. Tell us the address.
> 2. **Reachable from the company Wi-Fi.** Phones and laptops on the staff Wi-Fi must reach that address on TCP
>    **8081** and **3000** (Mitra on the phones) and **4000** (DCRS in browsers). The Wi-Fi must not keep devices
>    apart: "client isolation" / "AP isolation" must be off on the staff network, and the phones must not be on a
>    guest network.
> 3. **Internet over HTTPS.** Mitra's answers come from Groq (api.groq.com), and Expo checks its sign-in at
>    expo.dev. The phones also need the internet the first time, to install Expo Go.
> 4. **Always on.** The PC never sleeps or hibernates (Power: Sleep "Never"), and switches itself on when the power
>    comes back (in the BIOS/UEFI: "Restore on AC power loss" set to "Power On").
> 5. **Signs itself in.** After a restart, Windows signs the server's standard account in by itself, so the
>    servers start (for example with Microsoft's Sysinternals Autologon, which keeps the password encrypted).
> 6. **Firewall.** We open the three ports with `scripts\windows\open-firewall.ps1` as an administrator; the
>    company network must be marked **Private** in Windows (or be a domain network), not Public.

## 3. Prepare the server PC (once)

1. **A standard Windows account** for the servers (Settings > Accounts > Other users > Add account; not an
   administrator). Sign in as it for every step below: the servers run as this account, so its files, its Node.js
   and Expo settings and its Expo sign-in must be its own. Without administrator rights, a fault in a server cannot
   take over the PC (and PostgreSQL, which keeps DCRS's records, refuses to run with administrator rights anyway).
2. **India Standard Time.** Settings > Time & language > Date & time: time zone "(UTC+05:30) Chennai, Kolkata,
   Mumbai, New Delhi", and "Set time automatically" on. Or: `Set-TimeZone -Id "India Standard Time"`. DCRS counts
   "today" by this clock.
3. **Node.js 24 (LTS)** from nodejs.org. Then sign out of Windows and in again.
4. **The folder.** Copy the DCRS folder (with `Audit project chatbot-mobile` inside) to the PC, for example to
   `C:\DCRS`. Or clone both:
   ```powershell
   git clone https://github.com/Pouchwale/Parth-Audit-project.git C:\DCRS
   git clone https://github.com/Pouchwale/Parth-Audit-chatbot.git "C:\DCRS\Audit project chatbot-mobile"
   ```
5. **The packages and the app**, in the DCRS folder (plain `npm install`: DCRS needs esbuild while it runs):
   ```powershell
   cd C:\DCRS
   npm install
   npm run build
   npm run mitra:setup
   ```
   Run `npm run build` again after every update.
6. **DCRS's settings**: `backend\.env` (one `KEY=value` per line). Usually only:
   ```text
   # The address in the links Mitra hands out, so that a phone can open them.
   DCRS_APP_URL=http://<server address>:4000
   # Optional: the first password of the named accounts (step 7).
   SEED_ACCOUNT_PASSWORD=<a first password of your choosing>
   # Optional: Mitra inside DCRS, in the browsers.
   GROQ_API_KEY=<your Groq key>
   ```
   Never on the plant: `DEMO_MODE`, `ALLOW_SIGNUP`, `DCRS_WORKING_HOURS=off`. Without `DATABASE_URL`, DCRS keeps its
   records in a PostgreSQL of its own (docs/DEPLOYMENT.md, "Database").
7. **The Mitra server's settings**: copy `Audit project chatbot-mobile\server\.env.example` to
   `Audit project chatbot-mobile\server\.env` and fill in:
   ```text
   PORT=3000
   CREDENTIALS_KEY=<32 random bytes, base64: see the command below>
   DCRS_BASE_URL=http://127.0.0.1:4000
   GROQ_API_KEY=<your Groq key, from https://console.groq.com/keys>
   SUPER_ADMINS=<the DCRS super admin's sign-in email>
   REPORT_TIME_ZONE=Asia/Kolkata
   ```
   Make the `CREDENTIALS_KEY` with:
   ```powershell
   node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"
   ```
   Leave `DATABASE_URL` empty (its own database in `server\.data`) and `HOST` out (it listens on every network card).
8. **An Expo account, for the iPhones.** Since 3 September 2026, Expo Go on an iPhone opens an app from a computer
   only when that computer and the iPhone are signed in to the **same Expo account** (Expo says Android will follow).
   Make a free account at expo.dev just for the plant (nothing else in it: every iPhone signs in with it). Then, as
   the server's Windows account:
   ```powershell
   cd "C:\DCRS\Audit project chatbot-mobile\mobile"
   npx expo login
   ```

## 4. Open the firewall

In PowerShell **as an administrator** (Start menu, type PowerShell, right-click "Windows PowerShell", "Run as
administrator"), in the DCRS folder:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\open-firewall.ps1 -DryRun
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\open-firewall.ps1
```

The first line shows what it would do and changes nothing. The second adds three inbound rules (TCP 4000, 3000,
8081) for Private and Domain networks; running it again is safe. If it lists the company network as **Public**, the
rules do not apply there: add `-SetPrivate` (only on the company network). `-Remove` takes the rules away.
`-AnyProfile` opens Public networks too: avoid it.

## 5. Start everything, and at power-on

- **By hand**, to try it: `npm run plant:start`. It starts DCRS, then the Mitra server, then Mitra for Expo Go
  (pointed at this PC's address), each hidden, and starts again any that stops. Keep the window open; Ctrl+C stops
  all three. `npm run plant:start -- -DryRun` shows what it would start and starts nothing.
- **At sign-in, by itself** (as the server's account, in an ordinary PowerShell):
  ```powershell
  powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\install-autostart.ps1 -DryRun
  powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\install-autostart.ps1
  Start-ScheduledTask -TaskName "DCRS plant servers"
  ```
  The task "DCRS plant servers" runs the same script with no window whenever the account signs in. With IT's
  automatic sign-in (step 2), that is every time the PC starts, power cuts included. If Windows refuses to register
  it, run it as an administrator with `-User <PC name>\<the server's account>`. `-Remove` takes it away.
- **Stop**: `powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\start-plant-servers.ps1 -Stop`.
  DCRS's database keeps running in the background; `npm run db:stop` stops it (before copying or restoring it).
- **Logs**: the `logs` folder: `plant-servers.log` (what was started, stopped and started again), `dcrs.log`,
  `mitra-server.log`, `expo.log`.

## 6. Each phone

1. Install **Expo Go**: Play Store on Android, App Store on an iPhone.
2. Join the **company Wi-Fi**.
3. **iPhone only:** in Expo Go, tap the round picture at the top right and sign in with the plant's Expo account
   (step 3.8).
4. **Scan the code**: in DCRS, open **Ask Mitra** and, under **Mitra on your phone**, **Show the code**. (When Expo
   is started by hand in a window instead, with `npm run phones` in the app's folder, the QR code it prints works
   too.)
   - **iPhone:** with the Camera app; tap the banner to open it in Expo Go. When Expo Go asks to find devices on the
     local network, tap **Allow** (to change it later: Settings > Privacy & Security > Local Network > Expo Go).
   - **Android:** inside Expo Go, **Scan QR code**.
5. **Sign in** with the person's DCRS email (in the "Username" box) and DCRS password.
6. Allow the microphone and the camera for Expo Go when asked (voice and photos). Next time, Mitra is under
   **Recently opened** in Expo Go.

## 7. Who can sign in, and when

- **The first password must be changed once, in DCRS in a browser** (`http://<server address>:4000`). Every account
  starts on a first password: the built-in one for the named accounts (`Gpp@12345`, unless `SEED_ACCOUNT_PASSWORD`
  was set), or the one the super admin typed on Users & Access. Until it is changed, the phone says "Sign in to DCRS
  in a browser and choose your own password first."
- **Staff sign in only during the working hours**: 8:40 am to 6:20 pm, on working days (the super admin can change
  the times on Master Data > Working Hours). **Thursday is the weekly off**, except an adjustment Thursday that is
  worked in place of a festival; festival holidays are closed. Outside the hours the phone shows DCRS's own words
  and when it opens.
- **The super admin** (`admin@gpp.local` on a new DCRS) may sign in at any time.
- Every sign-in ends at the close of its day (6:20 pm for staff, midnight for the super admin), on the phone too, so
  each morning starts with signing in. `SUPER_ADMINS` in `server\.env` gives the same people the app's own
  Accounts and Security views.

## 8. Keep Expo Go and the app in step

- Expo Go opens **one Expo SDK, the latest**. Mitra is on **SDK 57**, which today's Expo Go opens (Expo Go 57.0.9,
  2 September 2026).
- When Expo releases the next SDK (58 is in beta), the stores' Expo Go moves to it and **stops opening Mitra** until
  the app is upgraded. Upgrade it first, in `Audit project chatbot-mobile\mobile` (a developer's job, tested and
  committed in the app's own repository), then start the servers again:
  ```powershell
  npx expo install expo@^58.0.0 --fix
  npx expo install --fix
  npx expo-doctor
  ```
- Watch https://expo.dev/changelog. On Android, automatic updates can be turned off for Expo Go alone (Play Store,
  Expo Go, the three-dot menu, "Enable auto update"), to hold it back until the server is upgraded.

## 9. Check that it works

On the server PC:

```powershell
npm run phone:check
```

It says PASS or FAIL for DCRS, its working hours, the clock and time zone, the Mitra server, Expo, what Expo Go
loads on Android and on an iPhone (the address and the Expo account), and prints the two addresses to hand out. To
try a real sign-in through Mitra as well (the password is asked without showing, and never typed on the command
line):

```powershell
$env:PHONE_CHECK_PASSWORD = [Net.NetworkCredential]::new("", (Read-Host "Password" -AsSecureString)).Password
npm run phone:check -- --email <a DCRS sign-in email>
Remove-Item Env:PHONE_CHECK_PASSWORD
```

Then, with **one Android phone and one iPhone** on the company Wi-Fi:

1. In the phone's browser, `http://<server address>:3000/health` shows `{"ok":true}`.
2. `http://<server address>:8081/status` shows `packager-status:running`.
3. `http://<server address>:4000` shows DCRS's sign-in page.
4. Scan the code in Expo Go (step 6): Mitra's sign-in screen appears.
5. Sign in, and ask "What is due today?": Mitra answers.
6. Tap the microphone ("Record a voice message"), say something, then **Finish**: Mitra turns it into words.

## 10. When something is wrong

| What you see | Why, usually | What to do |
|---|---|---|
| The phone's browser cannot open `http://<server address>:3000/health` | The phone is on another Wi-Fi (guest), the Wi-Fi keeps devices apart, the firewall, or the PC is off or asleep | Same Wi-Fi as the PC; ask IT to turn client isolation off (step 2); run step 4; check the PC is on |
| It opens on the PC but not on any phone | Windows Firewall, or the network is marked Public | Step 4, with `-SetPrivate` on the company network |
| Expo Go: "could not connect", or it keeps loading | Expo is not running, or it gave the phones a wrong address | `npm run phone:check`: read "What Expo Go loads"; restart with `npm run plant:start` |
| The code points at an old address | The PC's address changed (no DHCP reservation) | Ask IT for a reservation (step 2), then stop and start the servers |
| iPhone: Expo Go asks to sign in, or will not open Mitra | Expo on the PC and Expo Go on the iPhone are not on the same Expo account | `npx expo login` on the PC (step 3.8), then sign Expo Go in with the same account |
| iPhone: scanning does nothing, or it cannot connect | Local Network is off for Expo Go | Settings > Privacy & Security > Local Network > Expo Go |
| Expo Go says the project is not compatible | Expo Go moved to a newer SDK | Step 8 |
| "Mitra can't reach its server" (with an address) | The Mitra server stopped, or port 3000 is blocked | `logs\mitra-server.log`, `npm run phone:check`, step 4 |
| Sign-in refused, saying DCRS is closed | Outside the working hours | Staff wait for the opening it names; the super admin may sign in |
| "Sign in to DCRS in a browser and choose your own password first." | The account is still on its first password | Change it once in DCRS in a browser (step 7) |
| "Wrong username or password." | Not the person's DCRS email and password | Use the DCRS ones; the super admin can reset it on Users & Access |
| Mitra is slow, or says to wait a minute | Groq's free plan allows about 8,000 tokens a minute for the whole plant | Wait a minute; a paid Groq plan allows more |
| Records dated a day out, or "today" is wrong | The PC's time zone or clock | Step 3.2; `npm run phone:check` checks it |
| After a restart nothing answers | Windows did not sign the account in, or the task is missing | Step 2.5 and step 5; read `logs\plant-servers.log` |

## 11. Keeping it safe

- **Plain http, on the company Wi-Fi only.** Never forward ports 4000, 3000 or 8081 from the internet, and do not
  use `-AnyProfile` on a PC that leaves the plant.
- **Keep these private**: `backend\data\jwt-secret.txt` (anyone holding it can make a DCRS sign-in),
  `backend\data\postgres-password`, `backend\.env`, the Mitra server's `server\.env` (its `CREDENTIALS_KEY` unlocks
  the DCRS sign-ins it keeps, and its Groq key is the plant's), and the plant's Expo account password.
- **The servers run as the standard account** (step 3.1), never as an administrator. Autologon keeps its password
  encrypted, but an administrator of the PC can read it: keep the PC's administrators few.
- **Backups**: DCRS's database with `npm run db:backup`, every evening by itself (docs/DEPLOYMENT.md, "Backups of the
  shared database"). The Mitra server's own database is the `Audit project chatbot-mobile\server\.data` folder: copy
  it while the servers are stopped.
- **A lost phone**: switch the person's DCRS account off on Users & Access (it stops at once); the app's super admin
  can also sign that phone out (Accounts). If it was an iPhone, change the plant's Expo account password.
