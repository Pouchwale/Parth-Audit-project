// THIS COMPUTER'S ADDRESSES ON THE COMPANY NETWORK, backend/lanAddresses.ts: which
// of the PC's addresses laptops and phones are told to open, best first. Proved on
// tables like the ones os.networkInterfaces() answers, this PC's own among them
// (2-Oct-2026: a USB cable "Ethernet 7" at 10.192.193.24 and the WSL adapter):
//   * IPv4 only; never 127.x, 169.254.x, an internal or a malformed address;
//     each address once;
//   * a real network card before a virtual one (WSL, Hyper-V, VirtualBox, VMware,
//     Docker, Tailscale, ZeroTier, Bluetooth), a private address before a public
//     one, Wi-Fi before a cable, then the system's own order;
//   * the lines DCRS prints at start: one per real card, none for a virtual one,
//     and a plain line when there is no address at all.
// Run: npm run test:unit -- lanAddresses
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { companyNetworkLines, isIPv4, isPrivateIPv4, isVirtualAdapter, isWifiAdapter, lanAddresses, type InterfaceTable } from "../lanAddresses.ts";

const v4 = (address: string, internal = false) => ({ address, family: "IPv4", internal });
const v6 = (address: string, internal = false) => ({ address, family: "IPv6", internal });

describe("the addresses, best first", () => {
  it("reads this PC's own table: the cable first, the WSL adapter last, no loopback", () => {
    const table: InterfaceTable = {
      "vEthernet (WSL (Hyper-V firewall))": [v6("fe80::29f9:b6d:910b:8780"), v4("172.29.144.1")],
      "Ethernet 7": [v6("fe80::a35d:4f77:4596:5ea5"), v4("10.192.193.24")],
      "Loopback Pseudo-Interface 1": [v6("::1", true), v4("127.0.0.1", true)],
    };
    assert.deepEqual(lanAddresses(table), [
      { ip: "10.192.193.24", interface: "Ethernet 7" },
      { ip: "172.29.144.1", interface: "vEthernet (WSL (Hyper-V firewall))" },
    ]);
  });

  it("puts the Wi-Fi before a cable, as the phones are on the Wi-Fi", () => {
    const table: InterfaceTable = {
      Ethernet: [v4("192.168.1.20")],
      "Wi-Fi": [v4("192.168.0.107")],
    };
    assert.deepEqual(
      lanAddresses(table).map((a) => a.interface),
      ["Wi-Fi", "Ethernet"]
    );
  });

  it("puts every virtual adapter after every real card, whatever it is called", () => {
    const table: InterfaceTable = {
      "VirtualBox Host-Only Network": [v4("192.168.56.1")],
      "vEthernet (Default Switch)": [v4("172.20.0.1")],
      "VMware Network Adapter VMnet8": [v4("192.168.204.1")],
      "Bluetooth Network Connection": [v4("192.168.44.2")],
      Tailscale: [v4("100.101.102.103")],
      "ZeroTier One [8056c2e21c000001]": [v4("10.147.17.5")],
      "vEthernet (WSL)": [v4("172.29.144.1")],
      "Ethernet 2": [v4("10.0.0.15")],
    };
    const got = lanAddresses(table);
    assert.equal(got[0].interface, "Ethernet 2");
    assert.equal(got.length, 8);
    assert.ok(got.slice(1).every((a) => isVirtualAdapter(a.interface)), JSON.stringify(got));
  });

  it("leaves out loopback, self-assigned, internal, IPv6 and malformed addresses, and says each address once", () => {
    const table: InterfaceTable = {
      "Local Area Connection* 1": [v4("169.254.169.129")],
      "Local Area Connection* 2": [v4("169.254.28.96")],
      Odd: [v4("127.0.0.2"), v4("10.1.2.3", true), v4("0.0.0.0"), v4("300.1.1.1"), v4("10.1.2"), v6("2001:db8::1")],
      "Wi-Fi": [v4("192.168.0.107"), v4("192.168.0.107")],
      "Wi-Fi 2": [v4("192.168.0.107")],
      Empty: undefined,
    };
    assert.deepEqual(lanAddresses(table), [{ ip: "192.168.0.107", interface: "Wi-Fi" }]);
  });

  it("takes the family as a number too (Node 18.0 to 18.3 said 4)", () => {
    assert.deepEqual(lanAddresses({ Ethernet: [{ address: "10.0.0.9", family: 4, internal: false }] }), [{ ip: "10.0.0.9", interface: "Ethernet" }]);
  });

  it("puts a private address before a public one, and keeps the system's order otherwise", () => {
    const table: InterfaceTable = {
      "Ethernet 3": [v4("203.0.113.7")],
      "Ethernet 1": [v4("10.0.0.2")],
      "Ethernet 2": [v4("10.0.0.3")],
    };
    assert.deepEqual(
      lanAddresses(table).map((a) => a.ip),
      ["10.0.0.2", "10.0.0.3", "203.0.113.7"]
    );
  });

  it("answers nothing for a computer with no network", () => {
    assert.deepEqual(lanAddresses({}), []);
    assert.deepEqual(lanAddresses({ "Loopback Pseudo-Interface 1": [v4("127.0.0.1", true)] }), []);
  });
});

describe("the words for addresses and cards", () => {
  it("knows a private address from a public one, to the edge of each range", () => {
    for (const ip of ["10.0.0.1", "10.255.255.255", "172.16.0.1", "172.31.255.255", "192.168.0.1", "192.168.255.254"]) assert.ok(isPrivateIPv4(ip), ip);
    for (const ip of ["11.0.0.1", "172.15.255.255", "172.32.0.1", "192.169.0.1", "100.64.0.1", "8.8.8.8", "not an address", "10.0.0"]) assert.ok(!isPrivateIPv4(ip), ip);
  });

  it("knows an IPv4 address", () => {
    assert.ok(isIPv4("192.168.0.107"));
    for (const ip of ["192.168.0", "192.168.0.256", "a.b.c.d", "1.2.3.4.5", "", "::1"]) assert.ok(!isIPv4(ip), ip);
  });

  it("knows a virtual adapter and a Wi-Fi card by their names", () => {
    for (const name of ["vEthernet (WSL (Hyper-V firewall))", "VirtualBox Host-Only Network", "VMware Network Adapter VMnet1", "Docker NAT", "Tailscale", "ZeroTier One", "Bluetooth Network Connection", "Npcap Loopback Adapter", "TAP-Windows Adapter"]) {
      assert.ok(isVirtualAdapter(name), name);
    }
    for (const name of ["Wi-Fi", "Ethernet 7", "Local Area Connection", "WLAN", "Ethernet"]) assert.ok(!isVirtualAdapter(name), name);
    for (const name of ["Wi-Fi", "Wi-Fi 2", "WLAN", "WiFi", "Wireless Network Connection", "wlan0", "wlp2s0"]) assert.ok(isWifiAdapter(name), name);
    for (const name of ["Ethernet 7", "eth0", "vEthernet (WSL)"]) assert.ok(!isWifiAdapter(name), name);
  });
});

describe("what DCRS prints when it starts", () => {
  it("names each real card's address with the port, and leaves out the virtual ones", () => {
    const lines = companyNetworkLines(4000, [
      { ip: "10.192.193.24", interface: "Ethernet 7" },
      { ip: "192.168.0.107", interface: "Wi-Fi" },
      { ip: "172.29.144.1", interface: "vEthernet (WSL (Hyper-V firewall))" },
    ]);
    assert.deepEqual(lines, ["On the company network: http://10.192.193.24:4000 (Ethernet 7)", "On the company network: http://192.168.0.107:4000 (Wi-Fi)"]);
  });

  it("says plainly when there is no address to give", () => {
    assert.deepEqual(companyNetworkLines(4000, []), ["On the company network: no address yet - this computer is not connected to a network."]);
    assert.deepEqual(companyNetworkLines(4000, [{ ip: "172.29.144.1", interface: "vEthernet (WSL)" }]), [
      "On the company network: no address yet - this computer is not connected to a network.",
    ]);
  });
});
