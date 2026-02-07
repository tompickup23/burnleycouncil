# TOOLS.md - Local Notes

Skills define *how* tools work. This file is for *your* specifics — the stuff that's unique to your setup.

## What Goes Here

Things like:
- Camera names and locations
- SSH hosts and aliases  
- Preferred voices for TTS
- Speaker/room names
- Device nicknames
- Anything environment-specific

## wacli (WhatsApp CLI)

**Phone number format for sending:**
- ❌ Wrong: `+447592231421`
- ✅ Correct: `447592231421@s.whatsapp.net`
- Format: `[country code][number]@s.whatsapp.net` (no + prefix)

**Usage:**
```bash
wacli send text --to "447592231421@s.whatsapp.net" --message "text"
```

## SSH Hosts

### Thurinus (Oracle VPS - Primary News Server)
- **IP:** 141.147.79.228
- **User:** ubuntu
- **Key:** `/Users/tompickup/Downloads/ssh-key-2026-02-05.key`
- **Command:** `ssh -i /Users/tompickup/Downloads/ssh-key-2026-02-05.key ubuntu@141.147.79.228`
- **Hosts:** newslancashire.co.uk
- **Stack:** Hugo + Nginx + SQLite + Python crawler
- **Important paths:**
  - Site: `~/newslancashire/site/`
  - Content: `~/newslancashire/site/content/`
  - Theme: `~/newslancashire/site/themes/newslancashire-theme-v2/`
  - DB: `~/newslancashire/db/news.db`
  - Scripts: `~/newslancashire/scripts/`
  - Logs: `~/newslancashire/logs/`
- **Rebuild:** `cd ~/newslancashire/site && hugo --gc --minify`

### Octavianus (AWS t3.micro - Burnley Worker)
- **IP:** 51.20.51.127
- **User:** ubuntu
- **Key:** `/Users/tompickup/Downloads/clawdbotkeypair.pem`
- **Command:** `ssh -i /Users/tompickup/Downloads/clawdbotkeypair.pem ubuntu@51.20.51.127`
- **Hosts:** newsburnley.co.uk
- **Stack:** Nginx + static HTML
- **Note:** AWS t3.micro costs ~$8.50/month after free tier. Consider migrating to Thurinus.

## Why Separate?

Skills are shared. Your setup is yours. Keeping them apart means you can update skills without losing your notes, and share skills without leaking your infrastructure.

---

Add whatever helps you do your job. This is your cheat sheet.
