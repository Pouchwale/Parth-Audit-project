// THIS COMPUTER'S ADDRESSES ON THE COMPANY NETWORK (2-Oct-2026, docs/phone-app-setup.md).
//
// The plant runs the whole application on one server PC: DCRS (port 4000), the
// Mitra server (3000) and Expo's server for Expo Go (8081). Laptops and desktops
// open DCRS at http://<address>:4000 and phones open Mitra in Expo Go at
// exp://<address>:8081, so the PC's own address on the company network is needed
// in three places: the line DCRS prints when it starts (backend/phoneApp.ts),
// GET /api/phone-app, which the QR card on the Ask Mitra page reads, and the phone
// check (scripts/phone-check.ts). scripts/windows/start-plant-servers.ps1 picks the
// address Expo puts in its QR code by the same rules, written again in PowerShell.
//
// THE RULES. IPv4 only. Never the computer's own loopback (127.x.x.x), nor an
// address Windows gives itself when no network answered (169.254.x.x). Then, best
// first:
//   1. a real network card before a virtual one (WSL, Hyper-V, VirtualBox, VMware,
//      Docker, Tailscale, ZeroTier, Bluetooth and the like): no phone on the
//      company Wi-Fi reaches a virtual adapter, so it comes last, never first;
//   2. a private address (10.x, 172.16-31.x, 192.168.x), which is what a company
//      network hands out, before any other;
//   3. Wi-Fi before a cable, as the phones are on the Wi-Fi;
//   4. otherwise in the order the system lists them.
//
// Pure: it reads only what it is given (os.networkInterfaces()'s answer).

/** One address of this computer, as GET /api/phone-app answers it. */
export interface LanAddress {
  ip: string;
  /** The network card's name, as Windows shows it ("Wi-Fi", "Ethernet 2"). */
  interface: string;
}

/** What os.networkInterfaces() says about one address (the fields read here). */
export interface InterfaceAddress {
  address: string;
  family: string | number;
  internal: boolean;
}

export type InterfaceTable = Record<string, readonly InterfaceAddress[] | undefined>;

/** Network cards that exist only inside this computer, or reach another network than the company's. */
const VIRTUAL_ADAPTER = /vEthernet|\bWSL\b|Hyper-V|VirtualBox|VMware|VMnet|Docker|Tailscale|ZeroTier|Bluetooth|Loopback|\bTAP\b/i;
/** Wi-Fi cards, by the names Windows and other systems give them. */
const WIFI_ADAPTER = /wi-?fi|wlan|wireless|^wl/i;

export function isVirtualAdapter(name: string): boolean {
  return VIRTUAL_ADAPTER.test(name);
}

export function isWifiAdapter(name: string): boolean {
  return WIFI_ADAPTER.test(name);
}

/** Four numbers from 0 to 255, and nothing else. */
export function isIPv4(ip: string): boolean {
  const parts = ip.split(".");
  return parts.length === 4 && parts.every((p) => /^\d{1,3}$/.test(p) && Number(p) <= 255);
}

/** 10.x, 172.16-31.x and 192.168.x: the addresses a company network hands out. */
export function isPrivateIPv4(ip: string): boolean {
  if (!isIPv4(ip)) return false;
  const [a, b] = ip.split(".").map(Number);
  return a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
}

/** This computer's own loopback (127.x) or an address it made up because no network answered (169.254.x). */
function unusable(ip: string): boolean {
  return ip.startsWith("127.") || ip.startsWith("169.254.") || ip === "0.0.0.0";
}

/** This computer's IPv4 addresses that another device could open, the best first (see THE RULES above). */
export function lanAddresses(interfaces: InterfaceTable): LanAddress[] {
  const found: { ip: string; name: string; order: number }[] = [];
  const seen = new Set<string>();
  for (const [name, list] of Object.entries(interfaces)) {
    for (const a of list ?? []) {
      // Node said 4 instead of "IPv4" for a few versions (18.0 to 18.3).
      const v4 = a.family === "IPv4" || a.family === 4;
      if (!v4 || a.internal || !isIPv4(a.address) || unusable(a.address) || seen.has(a.address)) continue;
      seen.add(a.address);
      found.push({ ip: a.address, name, order: found.length });
    }
  }
  const rank = (x: { ip: string; name: string }): number[] => [isVirtualAdapter(x.name) ? 1 : 0, isPrivateIPv4(x.ip) ? 0 : 1, isWifiAdapter(x.name) ? 0 : 1];
  found.sort((x, y) => {
    const rx = rank(x);
    const ry = rank(y);
    for (let i = 0; i < rx.length; i++) if (rx[i] !== ry[i]) return rx[i] - ry[i];
    return x.order - y.order;
  });
  return found.map(({ ip, name }) => ({ ip, interface: name }));
}

/**
 * The lines DCRS prints when it starts, under "API server listening on
 * http://localhost:<port>": the address laptops and desktops open, one line per
 * real network card. A virtual adapter is left out, as nobody else can open it.
 */
export function companyNetworkLines(port: number, addresses: readonly LanAddress[]): string[] {
  const real = addresses.filter((a) => !isVirtualAdapter(a.interface));
  if (real.length === 0) return ["On the company network: no address yet - this computer is not connected to a network."];
  return real.map((a) => `On the company network: http://${a.ip}:${port} (${a.interface})`);
}
