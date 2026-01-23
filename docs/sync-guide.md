# Sync Guide

This guide explains how Hypermark synchronizes your bookmarks between devices using a combination of peer-to-peer and cloud-based technology.

## Table of Contents

- [Overview](#overview)
- [Getting Started](#getting-started)
- [Device Pairing](#device-pairing)
- [Understanding Sync](#understanding-sync)
- [Relay Configuration](#relay-configuration)
- [Sync Indicators](#sync-indicators)
- [Troubleshooting](#troubleshooting)
- [Privacy & Security](#privacy--security)
- [FAQ](#faq)

## Overview

Hypermark uses a dual-sync approach to keep your bookmarks synchronized across all your devices:

1. **P2P Sync (WebRTC)**: Real-time sync when devices are online simultaneously
2. **Cloud Sync (Nostr)**: Asynchronous sync via encrypted messages stored on decentralized relays

This combination ensures your bookmarks stay in sync whether your devices are online at the same time or not.

### Key Features

- **No account required**: Your devices pair directly using a secure code
- **End-to-end encrypted**: Only your devices can read your bookmarks
- **Decentralized**: No single server controls your data
- **Conflict-free**: Simultaneous edits on different devices are automatically merged

## Getting Started

### First-Time Setup

1. Open Hypermark on your first device
2. Go to **Settings** > **Device pairing**
3. Click **Show Pairing Code**
4. A code will appear (e.g., `42-apple-river`)

On your second device:

1. Open Hypermark
2. Go to **Settings** > **Device pairing**
3. Click **Enter Pairing Code**
4. Type the code exactly as shown on the first device
5. Wait for the "Pairing Complete" confirmation

Your devices are now securely linked and will sync automatically.

## Device Pairing

### How Pairing Works

Device pairing establishes a secure connection between your devices without requiring any account or password. The pairing code (e.g., `42-apple-river`) creates a temporary encrypted channel for exchanging cryptographic keys.

**The pairing code has three parts:**
- A number (1-999): Identifies the connection room
- Two words: Provide the encryption password

### Pairing Process

**On the device with your bookmarks (Source device):**

1. Go to **Settings** > **Device pairing**
2. Select **Show Pairing Code**
3. A unique code will be displayed
4. Keep this screen open while you set up the other device

**On the new device:**

1. Go to **Settings** > **Device pairing**
2. Select **Enter Pairing Code**
3. Enter the code exactly as shown
4. Click **Connect**

The devices will:
1. Establish a secure connection
2. Exchange encryption keys
3. Begin syncing your bookmarks

### Important Notes

- **Code expires in 5 minutes**: If the pairing times out, generate a new code
- **Case-insensitive**: Uppercase and lowercase don't matter
- **Exact match required**: Enter the code exactly as displayed

### Pairing Additional Devices

Repeat the process for each new device. Any already-paired device can act as the source device to pair additional ones.

## Understanding Sync

### What Gets Synced

Everything in your bookmarks is synchronized:
- Bookmark titles
- URLs
- Tags
- Descriptions
- Read-later status
- Last modified timestamps

### How Sync Works

#### P2P Sync (Real-time)

When multiple devices are online simultaneously:
- Changes are sent directly between devices
- Sync happens in real-time (sub-second)
- Indicated by the P2P status showing connected devices

#### Cloud Sync (Nostr)

When devices are not online at the same time:
- Changes are encrypted and published to Nostr relays
- Other devices fetch changes when they come online
- Changes are debounced (collected for 1.5 seconds before publishing)

### Conflict Resolution

Hypermark uses CRDT (Conflict-free Replicated Data Type) technology to handle conflicts automatically:

| Scenario | What Happens |
|----------|--------------|
| Edit title on Device A, add tag on Device B | Both changes are preserved |
| Edit same field on both devices | Changes are merged deterministically |
| Delete on one device, edit on another | Delete wins |
| Create same bookmark simultaneously | Both are preserved with unique IDs |

You never need to manually resolve conflicts.

## Relay Configuration

### What Are Relays?

Nostr relays are servers that store and forward your encrypted bookmark data. Think of them as message delivery services. Your bookmarks are encrypted before being sent, so relay operators cannot read your data.

### Default Relays

Hypermark connects to several public relays by default:
- `wss://relay.damus.io`
- `wss://nos.lol`
- `wss://relay.nostr.band`
- `wss://nostr-pub.wellorder.net`
- `wss://relay.current.fyi`

### Why Multiple Relays?

Using multiple relays provides:
- **Redundancy**: If one relay is down, others still work
- **Reliability**: Better chances your data is always accessible
- **Performance**: Connections to geographically closer relays may be faster

### Managing Relays

To configure relays:

1. Go to **Settings** > **Cloud Sync (Nostr)** > **Configure relays**
2. You'll see a list of all connected relays

**Testing a relay:**
- Click the lightning bolt icon next to any relay
- Shows connection status and latency

**Adding a custom relay:**
1. Click **Add**
2. Enter the WebSocket URL (must start with `wss://` or `ws://`)
3. Optionally test the connection
4. Click **Add Relay**

**Removing a custom relay:**
- Click the trash icon next to any custom relay
- Default relays cannot be removed

### Relay Status Indicators

| Icon | Meaning |
|------|---------|
| Green checkmark | Connected |
| Red X | Connection failed |
| Yellow spinning | Connecting |
| Gray server | Not tested |

**Latency colors:**
- Green: Excellent (<100ms)
- Yellow: Good (100-300ms)
- Red: Acceptable but slower (>300ms)

## Sync Indicators

### Settings Page

In **Settings** > **Cloud Sync (Nostr)**, you'll see:

**Relay connection:**
- Cloud icon with status indicator
- Number of connected relays (e.g., "4/5 relays connected")

**Last sync:**
- Shows when the last sync activity occurred
- "Just now", "5m ago", "1h ago", etc.

**Pending updates:**
- Shows number of changes waiting to be synced
- "0 pending" means everything is synced
- "3 pending" means 3 changes are queued

### Status Colors

| Color | Meaning |
|-------|---------|
| Green | Connected and syncing |
| Yellow | Connecting or syncing in progress |
| Gray | Not connected |
| Red | Error (check diagnostics) |

## Troubleshooting

### Using Diagnostics

Go to **Settings** > **Cloud Sync (Nostr)** > **Sync diagnostics** for comprehensive troubleshooting tools.

**Overview tab:**
- Shows system health at a glance
- Run diagnostics to check all components
- View your Nostr public key (fingerprint)

**Troubleshoot tab:**
- Automated suggestions based on detected issues
- Common issues and solutions

**History tab:**
- View recent sync activity
- Helpful for debugging sync issues

### Common Issues

#### Bookmarks not syncing

1. Check that sync is enabled in **Settings** > **Cloud Sync (Nostr)**
2. Verify at least one relay is connected (green status)
3. Ensure your device is paired (has encryption keys)
4. Try clicking **Sync** to force a sync

#### Missing bookmarks on a new device

After pairing a new device:
1. Wait a few moments for initial sync
2. Check that relays are connected
3. Bookmarks sync through relays, which may take time if you have many

#### Relay connection errors

1. Go to **Configure relays** and test each relay
2. Some relays may be temporarily unavailable
3. Add additional relays for redundancy
4. Check your internet connection

#### Changes not appearing on other devices

1. Changes are debounced (1.5 second delay before publishing)
2. Check the "pending" counter in Settings
3. If updates stay pending, there may be a connection issue
4. Try **Sync** to force pending changes

#### Pairing failed

- Ensure you entered the code exactly as shown
- Check internet connection on both devices
- The code expires after 5 minutes - get a new one
- Both devices must be on the same Hypermark version

### Exporting Diagnostics

For advanced troubleshooting:
1. Go to **Sync diagnostics**
2. Click **Export**
3. A JSON file will download with detailed diagnostic information

## Privacy & Security

### Encryption

Your bookmarks are protected by multiple layers of encryption:

| Layer | What It Protects |
|-------|------------------|
| LEK (Ledger Encryption Key) | Encrypts all bookmark content |
| AES-256-GCM | Industry-standard encryption algorithm |
| Transport (TLS/WSS) | Encrypts data in transit |

### What Relays Can See

**Relays CAN see:**
- Your public key (same on all your devices)
- Bookmark IDs (not the content)
- Timestamps
- Sync frequency

**Relays CANNOT see:**
- Bookmark URLs
- Titles
- Tags
- Any content

### No Accounts, No Tracking

- No email, username, or password required
- No analytics or tracking
- Your identity is just a cryptographic key
- Different from every other user

### Key Security

The LEK (Ledger Encryption Key) is:
- Generated locally on your first device
- Transferred securely during pairing
- Never sent to any server unencrypted
- Stored only on your paired devices

## FAQ

### How is this different from browser sync?

- **No account required**: No email, password, or sign-up
- **You control your data**: Stored on decentralized relays
- **True encryption**: Even relay operators can't read your bookmarks
- **Cross-browser**: Works across different browsers and devices

### Can I use Hypermark on multiple devices?

Yes. Pair as many devices as you want. All paired devices share the same encryption key and stay in sync.

### What happens if I lose a device?

Your bookmarks remain safe on other paired devices and relays. The lost device cannot access your bookmarks without the encryption key stored on it.

If you're concerned about security, there's no way to "revoke" a device's access since there are no accounts. However, bookmarks are only accessible if someone has both:
1. Physical access to the device
2. Access to the browser storage

### Can I self-host relays?

Yes. You can run your own Nostr relay and add it in **Configure relays**. This gives you complete control over where your encrypted data is stored.

### How much data is stored on relays?

Each bookmark is stored as an individual encrypted event. Relays automatically keep only the latest version of each bookmark (using Nostr's "replaceable events" feature).

### Does sync work offline?

- **Local changes**: Always saved immediately
- **P2P sync**: Requires both devices online
- **Cloud sync**: Changes queued and published when connected

When you come back online, pending changes are automatically synced.

### What if a relay goes down permanently?

This is why Hypermark uses multiple relays. As long as at least one relay has your data, you can sync. Adding more relays increases redundancy.

### How do I stop syncing a device?

Currently, there's no way to "unpair" a device. You can:
1. Clear the browser data/storage on that device
2. Uninstall Hypermark from that device

The device will no longer have the encryption key and cannot sync.

### Is my data backed up?

Your bookmarks are stored on:
1. Each paired device (locally)
2. All connected Nostr relays (encrypted)

For additional backup, you can export your bookmarks (coming soon).
