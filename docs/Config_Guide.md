# ⚙️ Vantrix Configuration Guide

## 📖 **How to Use This Guide**

This guide explains **every setting** in your `config.yml` file. Each setting includes:
- **What it does** - Clear explanation
- **Options available** - What you can choose
- **Recommended values** - Best settings for most users
- **Impact on performance** - How it affects speed/resources

**💡 Pro Tip:** Start with the recommended settings, then customize as needed!

---

## 🔐 **1. Selfbot Section**

### **token**
```
token: "YOUR_DISCORD_TOKEN_HERE"
```

**What it does:** Your Discord user token that authenticates the bot
**How to get it:** See [docs/Get_Token.md](Get_Token.md)
**Security:** 🔴 **NEVER share this with anyone!**
**Required:** ✅ Yes

---

### **server1_id & server2_id**
```
server1_id: "1234567890123456789"
server2_id: ""  # Optional second server
```

**What it does:** Discord server IDs that Vantrix will protect
**How to get:** Right-click server icon → "Copy ID" (requires Developer Mode)
**Impact:** Bot only monitors these servers
**Note:** Leave server2_id empty if you only have one server

---

### **owner1_id & owner2_id**
```
owner1_id: "9876543210987654321"
owner2_id: ""  # Optional second owner
```

**What it does:** User IDs that can bypass all anti-nuke protection
**Who should set this:** Server owners and trusted administrators
**How to get:** Right-click username → "Copy ID"
**Benefits:** Owners can perform admin actions without triggering protection

---

## 🛡️ **2. Antinuke Settings Section**

### **punishment**
```
punishment: "ban"  # Options: "ban", "kick", "none"
```

**What it does:** Action taken when someone triggers anti-nuke
- **"ban"** - Permanently removes the attacker
- **"kick"** - Removes attacker but they can rejoin
- **"none"** - Just logs the incident, no punishment

**Recommended:** `"ban"` for maximum security
**When to use "kick":** If you want to give second chances
**When to use "none":** Testing or very lenient servers

---

### **auto_recovery**
```
auto_recovery: true
```

**What it does:** Automatically restore deleted channels and roles
**Impact:** Uses more API calls and memory
**Recommended:** `true` for complete protection
**Set to false:** If you have limited API usage or slow connection

---

### **recover_channels**
```
recover_channels: true
```

**What it does:** Recreate channels that attackers delete
**Requirements:** Bot needs "Manage Channels" permission
**Impact:** Creates new channels when deletions are detected
**Note:** Recovered channels keep original permissions

---

### **recover_roles**
```
recover_roles: true
```

**What it does:** Recreate roles that attackers delete
**Requirements:** Bot needs "Manage Roles" permission
**Impact:** Creates new roles with original permissions
**Note:** Role hierarchy is preserved when possible

---

### **recover_kicks**
```
recover_kicks: true
```

**What it does:** Send DM invites to users who were kicked
**Status:** 🧪 Experimental feature
**Requirements:** Users must accept DMs from server members
**Impact:** May spam kicked users with invites

---

### **recovery_delay**
```
recovery_delay: 1500
```

**What it does:** Milliseconds to wait between recovery actions
**Why needed:** Prevents hitting Discord's rate limits
**Recommended:** `1500` (1.5 seconds)
**Lower values:** Faster recovery but risk of rate limits
**Higher values:** Slower recovery but more stable

---

## 📊 **3. Action Limits Section**

### **Understanding Limits**
These settings determine how many actions trigger anti-nuke protection within the time window.

**How it works:**
- Bot counts actions (bans, kicks, etc.) in a time window
- If count exceeds limit, attacker gets punished
- Actions are tracked per user, per server

### **ban_limit**
```
ban_limit: 5
```

**What it triggers:** Mass banning attacks
**Example:** Someone bans 5+ people quickly
**Recommended:** `3-5` depending on server size

### **kick_limit**
```
kick_limit: 5
```

**What it triggers:** Mass kicking attacks
**Example:** Someone kicks 5+ people quickly
**Recommended:** `5-10` (kicks are less destructive than bans)

### **channel_create_limit**
```
channel_create_limit: 5
```

**What it triggers:** Spam channel creation
**Example:** Someone creates 5+ channels rapidly
**Recommended:** `3-5`

### **role_create_limit**
```
role_create_limit: 5
```

**What it triggers:** Spam role creation
**Example:** Someone creates 5+ roles rapidly
**Recommended:** `3-5`

### **channel_delete_limit**
```
channel_delete_limit: 5
```

**What it triggers:** Mass channel deletion
**Example:** Someone deletes 5+ channels quickly
**Impact:** ⚠️ Very destructive - low threshold recommended

### **role_delete_limit**
```
role_delete_limit: 5
```

**What it triggers:** Mass role deletion
**Example:** Someone deletes 5+ roles quickly
**Impact:** ⚠️ Very destructive - low threshold recommended

### **channel_update_limit**
```
channel_update_limit: 5
```

**What it triggers:** Rapid channel modifications
**Example:** Someone changes channel names/settings 5+ times
**Recommended:** `5-10`

### **role_update_limit**
```
role_update_limit: 5
```

**What it triggers:** Rapid role modifications
**Example:** Someone changes role permissions 5+ times
**Recommended:** `5-10`

### **member_update_limit**
```
member_update_limit: 5
```

**What it triggers:** Mass role assignments/removals
**Example:** Someone changes member roles 5+ times quickly
**Note:** Ignores roles listed in `ignored_role_ids`
**Recommended:** `3-5`

### **unban_limit**
```
unban_limit: 5
```

**What it triggers:** Mass unbanning (rare but possible)
**Example:** Someone unbans 5+ people quickly
**Recommended:** `5-10`

---

### **time_window**
```
time_window: 36000000  # 10 hours in milliseconds
```

**What it does:** Time period for counting actions
**Conversions:**
- `36000000` = 10 hours
- `3600000` = 1 hour
- `1800000` = 30 minutes
- `600000` = 10 minutes

**How it affects limits:**
- **Longer window** = More tolerant (allows more actions over time)
- **Shorter window** = More sensitive (triggers on rapid actions)

**Recommended:** `36000000` (10 hours) for balanced protection

---

### **ignored_role_ids**
```
ignored_role_ids: ["1234567890123456789", "9876543210987654321"]
```

**What it does:** Roles that won't trigger member update protection
**Perfect for:** Onboarding roles, autoroles, verification roles
**How to get IDs:** Server Settings → Roles → Right-click role → Copy ID
**Example use cases:**
- Welcome roles given to new members
- Roles assigned by reaction roles
- Verification roles
- Autoroles based on account age

---

## 📝 **4. Logging Section**

### **log_level**
```
log_level: "info"  # Options: "error", "warning", "info", "debug"
```

**What it controls:** How much information the bot logs
- **"error"** - Only errors and critical issues
- **"warning"** - Errors + warnings about suspicious activity
- **"info"** - Warnings + general information
- **"debug"** - Everything including technical details

**Performance impact:**
- **Higher levels** = More detailed logs = Slightly more CPU usage
- **Lower levels** = Fewer logs = Better performance

**Recommended:** `"info"` for normal use, `"debug"` when troubleshooting

---

### **timestamp**
```
timestamp: true
```

**What it does:** Adds timestamps to log messages
**Format:** `[2025-11-01 14:30:25]`
**Recommended:** `true` for better log readability

---

### **log_webhook**
```
log_webhook: "https://discord.com/api/webhooks/..."
```

**What it does:** Sends alerts to a Discord channel
**How to create:** Server Settings → Integrations → Webhooks → Create
**Benefits:** Real-time alerts in your server
**Leave empty:** To disable webhook logging

---

### **log_owner_dm**
```
log_owner_dm: false
```

**What it does:** Sends DM alerts to owners when attacks are detected
**Requirements:** Owners must allow DMs from server members
**Impact:** Can be spammy during attacks
**Recommended:** `false` unless you need instant notifications

---

## 👥 **5. Whitelist Section**

### **users**
```
whitelisted:
  users: ["1111111111111111111", "2222222222222222222"]
```

**What it does:** User IDs that bypass all anti-nuke protection
**Who to add:** Trusted administrators and moderators
**Difference from owners:** Owners are automatically whitelisted
**How to get IDs:** Right-click user → Copy ID

---

## 🎮 **6. RPC Section**

### **enabled**
```
enabled: true
```

**What it does:** Shows "Watching X servers" status on your Discord profile
**Impact:** Makes it obvious you're using a selfbot
**Recommended:** `false` for stealth, `true` for showing off

### **rotation**
```
rotation: true
```

**What it does:** Changes status message periodically
**Only works if:** `enabled: true`
**Recommended:** `true` for dynamic status

---

## 🎨 **7. Vanity Reversion Section**

### **password**
```
password: "YOUR_DISCORD_PASSWORD"
```

**What it does:** Enables automatic vanity URL reversion
**Security:** 🔴 **Store securely, never share!**
**Required for:** Vanity protection to work
**Leave empty:** To disable vanity reversion

---

### **fallback_vanity**
```
fallback_vanity: "myserver"
```

**What it does:** Backup vanity code when original can't be determined
**Use case:** When Discord's event data is incomplete
**Format:** Just the code, not "discord.gg/code"
**Recommended:** Set to your desired vanity code

---

## 🚀 **Quick Start Configurations**

### **Maximum Security (Recommended)**
```yaml
antinuke_settings:
  punishment: "ban"
  auto_recovery: true
  recover_channels: true
  recover_roles: true
  ban_limit: 3
  kick_limit: 5
  time_window: 36000000

logs:
  log_level: "info"
  log_webhook: "your_webhook_url"
```

### **Balanced Protection**
```yaml
antinuke_settings:
  punishment: "kick"
  auto_recovery: true
  recover_channels: false
  recover_roles: true
  ban_limit: 5
  kick_limit: 10
  time_window: 36000000

logs:
  log_level: "warning"
```

### **Minimal/Testing**
```yaml
antinuke_settings:
  punishment: "none"
  auto_recovery: false
  ban_limit: 10
  kick_limit: 15

logs:
  log_level: "debug"
```

### **Mobile/Android Optimized**
```yaml
antinuke_settings:
  auto_recovery: false
  recover_channels: false
  recover_roles: false
  member_update_limit: 3

logs:
  log_level: "error"
  log_owner_dm: false
```

---

## ⚡ **Performance Tuning**

### **For Low-End Devices:**
```yaml
antinuke_settings:
  auto_recovery: false
  recover_channels: false
  recover_roles: false
  recovery_delay: 3000

logs:
  log_level: "error"
  timestamp: false
```

### **For High-Traffic Servers:**
```yaml
antinuke_settings:
  recovery_delay: 1000
  time_window: 1800000  # 30 minutes

logs:
  log_level: "warning"
  log_webhook: "monitoring_channel_webhook"
```

---

## 🔧 **Common Configuration Mistakes**

### **❌ Wrong Token Format**
```yaml
token: "mfa.123456789..."  # Wrong
token: "MTEzMjMzODI1ND..."  # Correct - user token
```

### **❌ Invalid Server/User IDs**
```yaml
server1_id: "123456789"  # Wrong - too short
server1_id: "1234567890123456789"  # Correct - 19 digits
```

### **❌ Too Sensitive Limits**
```yaml
ban_limit: 1  # Wrong - will ban legitimate admins
ban_limit: 5  # Better - allows some admin actions
```

### **❌ Missing Vanity Password**
```yaml
vanity_reversion:
  password: ""  # Wrong - vanity won't work
  password: "mypassword123"  # Correct
```

---

## 📞 **Need Help?**

- **📚 Documentation:** Check other docs in this folder
- **🆘 Support Server:** https://discord.gg/NUPbGzY8Be
- **🐛 Report Issues:** https://github.com/faiz4sure/vantrix/issues
- **👨‍💻 Developer:** `faiz4sure`

---

## 💡 **Pro Tips**

1. **Start Conservative:** Use higher limits initially, lower them as needed
2. **Test Configurations:** Use `punishment: "none"` when testing
3. **Monitor Logs:** Check logs regularly to adjust limits
4. **Backup Config:** Keep a backup of working configurations
5. **Update Regularly:** Review and update settings as your server grows

**Remember: The best configuration balances security with usability! ⚖️**
