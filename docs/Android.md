# 📱 Running Vantrix on Android (Termux)

## ⚠️ **ANDROID IS NOT RECOMMENDED FOR PRODUCTION USE**

### **🚨 Critical Limitations:**

- **🔋 Battery optimization** kills processes frequently
- **📱 Background restrictions** prevent 24/7 operation
- **📶 Unstable connections** due to mobile network switching
- **🐌 Performance issues** on lower-end devices
- **❌ Cannot run 24/7** reliably

### **✅ When to Use Android:**
- 🧪 **Testing and development** only
- 🕒 **Temporary/short-term usage**
- 📚 **Learning and experimentation**

### **🏆 Recommended for 24/7 Protection:**
- **VPS Hosting** (DigitalOcean, Vultr, Linode) - $3-8/month
- **Cloud Servers** (AWS, Google Cloud) - Pay-as-you-use
- **Dedicated PC/Server** - Always-on reliability

**Bottom Line:** Use Android for testing, get VPS for serious protection!

---

## 📋 **System Requirements**

### **Minimum Requirements:**
- **Android 7.0+** (Android 9+ recommended)
- **2GB RAM** (4GB+ for better performance)
- **3GB free storage**
- **Stable internet** (WiFi strongly preferred)
- **Termux app** (terminal emulator)

### **Recommended Device:**
- **Android 11+**
- **4GB+ RAM**
- **Fast processor**
- **Always plugged in**

---

## 🛠️ **Step 1: Install Termux**

### **Download Termux:**

1. **F-Droid (Safest Option):**
   - Download F-Droid: https://f-droid.org/
   - Search for "Termux" in F-Droid
   - Install Termux

2. **GitHub (Alternative):**
   - Visit: https://github.com/termux/termux-app/releases
   - Download latest APK (arm64-v8a for most devices)
   - Install the APK

3. **⚠️ Avoid Google Play Store:**
   - Play Store version is outdated
   - Missing many features
   - Use F-Droid or GitHub instead

### **Initial Setup:**
- Open Termux after installation
- Grant storage permissions when prompted
- Allow notifications access

---

## 🔧 **Step 2: Setup Environment**

### **Update Packages:**
```bash
pkg update && pkg upgrade -y
```

### **Install Core Dependencies:**
```bash
pkg install -y git nodejs npm python curl wget
```

### **Setup Storage Access:**
```bash
termux-setup-storage
```

### **Verify Installation:**
```bash
node --version && npm --version
```

---

## 📥 **Step 3: Download Vantrix**

### **Clone Repository:**
```bash
cd ~ && git clone https://github.com/faiz4sure/vantrix.git && cd vantrix
```

### **Verify Files:**
```bash
ls -la
```

---

## 📦 **Step 4: Install Dependencies**

### **Install Node Modules:**
```bash
npm install
```

### **If Installation Fails:**
```bash
# Clear cache and retry
npm cache clean --force
npm install --no-optional
```

### **Verify Dependencies:**
```bash
npm list --depth=0
```

---

## ⚙️ **Step 5: Configure Vantrix**

### **Edit Configuration:**
```bash
nano config.yml
```

### **Essential Settings:**
```yaml
selfbot:
  token: "YOUR_DISCORD_TOKEN_HERE"  # Get from docs/Get_Token.md
  server1_id: "YOUR_SERVER_ID"      # Right-click server > Copy ID
  owner1_id: "YOUR_USER_ID"         # Right-click profile > Copy ID

antinuke_settings:
  punishment: "ban"      # ban, kick, or none
  auto_recovery: true    # Enable recovery features

vanity_reversion:
  password: "YOUR_DISCORD_PASSWORD"  # Required for vanity protection
  fallback_vanity: "yourserver"      # Backup vanity code
```

### **Mobile Optimizations:**
```yaml
# Reduce resource usage for mobile
antinuke_settings:
  auto_recovery: false   # Disable to save resources
  recover_channels: false
  recover_roles: false

logs:
  log_level: "error"     # Reduce log verbosity
  log_owner_dm: false    # Disable DM notifications
```

### **Save Configuration:**
- Press `Ctrl + X`
- Press `Y` to confirm
- Press `Enter` to save

---

## 🚀 **Step 6: Run Vantrix**

### **Start the Bot:**
```bash
node index.js
```

### **Test Protection:**
- Try changing a role in your server
- The bot should detect and respond
- Check logs for activity

---

## 🔄 **Step 7: Background Operation**

### **Method 1: Using Screen (Recommended):**
```bash
pkg install -y screen && screen -S vantrix
```
```bash
node index.js
```
*(Detach: Ctrl + A, then D | Reattach: screen -r vantrix)*

### **Method 2: Using nohup:**
```bash
nohup node index.js > bot.log 2>&1 &
```
```bash
ps aux | grep node
```
```bash
tail -f bot.log
```

### **Method 3: Simple Background:**
```bash
# Basic background (less reliable)
node index.js &
```

---

## 🔋 **Step 8: Battery & Performance Optimization**

### **Disable Battery Optimization:**

1. **Android Settings** → **Apps** → **Termux**
2. **Battery** → **Don't optimize**
3. **Background app refresh** → **Allow**
4. **Data usage** → **Unrestricted**

### **Keep Device Awake:**
```bash
# Prevent sleep (use carefully)
termux-wake-lock

# Release when done
termux-wake-unlock
```

### **Performance Monitoring:**
```bash
# Check memory usage
free -h

# Monitor processes
top

# Check CPU usage
ps aux
```

---

## 🛠️ **Troubleshooting**

### **Common Issues:**

#### **"Cannot find module" Error:**
```bash
# Reinstall dependencies
rm -rf node_modules package-lock.json
npm install
```

#### **"Token invalid" Error:**
- Double-check your token in config.yml
- Get fresh token using docs/Get_Token.md
- Ensure no extra spaces

#### **"Permission denied" Error:**
```bash
# Fix permissions
chmod +x index.js
termux-setup-storage
```

#### **Bot Keeps Stopping:**
- Use `screen` or `nohup` for background
- Disable battery optimization
- Keep device plugged in
- Use WiFi instead of mobile data

#### **High Memory Usage:**
- Reduce logging level to "error"
- Disable auto-recovery features
- Close other apps

#### **Network Issues:**
- Switch to WiFi
- Check internet connection
- Restart Termux

---

## 📊 **Mobile-Specific Optimizations**

### **Reduce Resource Usage:**
```yaml
# In config.yml, use these settings:
antinuke_settings:
  auto_recovery: false      # Saves memory
  recover_channels: false   # Reduces operations
  recover_roles: false      # Less processing
  member_update_limit: 3    # Lower threshold

logs:
  log_level: "error"        # Less logging
  log_owner_dm: false       # No DM spam
```

### **Monitor Performance:**
```bash
# Check system resources
termux-info

# Battery status
termux-battery-status

# Network info
termux-telephony-deviceinfo
```

---

## 🌐 **Better Alternatives for 24/7 Protection**

### **🏆 Recommended VPS Providers:**

#### **DigitalOcean ($6/month):**
- 1GB RAM, 1 vCPU, 25GB SSD
- Global data centers
- One-click Node.js setup

#### **Vultr ($2.50/month):**
- 512MB RAM, 1 vCPU, 10GB SSD
- High-performance SSD
- Multiple locations

#### **Linode ($5/month):**
- 1GB RAM, 1 vCPU, 25GB SSD
- Excellent support
- Easy scaling

#### **Contabo ($4/month):**
- 2GB RAM, 1 vCPU, 20GB SSD
- Great value for money
- Reliable performance

### **🆓 Free Options (Limited):**

#### **Oracle Cloud (Always Free):**
- 2 AMD-based VMs, 1GB RAM each
- Limited but sufficient for light usage

#### **Google Cloud (Free Trial):**
- $300 credit for 90 days
- Full access to powerful infrastructure

---

## 📱 **Termux-Specific Commands**

### **Useful Commands:**
```bash
# Check running processes
ps aux | grep node

# Kill bot process
pkill -f "node index.js"

# Restart bot
cd ~/vantrix && node index.js

# Check disk usage
df -h

# Check memory
free -h

# Send notification
termux-notification -t "Vantrix" -c "Bot is running"
```

### **File Management:**
```bash
# Edit config
nano config.yml

# View logs
tail -f logs.txt

# Backup config
cp config.yml config.backup.yml
```

---

## 🔐 **Security on Mobile**

### **Protect Your Token:**
- Never share config.yml
- Use environment variables:
```bash
export DISCORD_TOKEN="your_token_here"
# Then modify index.js to use process.env.DISCORD_TOKEN
```

### **Network Security:**
- Use WiFi for sensitive operations
- Avoid public WiFi
- Consider VPN for extra security

---

## 📞 **Support & Help**

### **Getting Help:**
- **Support Server:** https://discord.gg/NUPbGzY8Be
- **GitHub Issues:** https://github.com/faiz4sure/vantrix/issues
- **Developer:** `faiz4sure`

### **Before Asking:**
1. Check this guide thoroughly
2. Try troubleshooting steps above
3. Provide error logs when asking
4. Mention you're using Android/Termux

---

## ⚖️ **Important Disclaimers**

### **Legal Notice:**
- Selfbots violate Discord's Terms of Service
- Account termination is possible
- Use alternate accounts only

### **Performance Expectations:**
- Android will interrupt the bot frequently
- Battery drain will be significant
- Network issues are common
- Not suitable for critical protection

### **When Android is OK:**
- ✅ Testing new configurations
- ✅ Learning how Vantrix works
- ✅ Temporary protection (few hours)
- ✅ Development and debugging

### **When You Need VPS:**
- ❌ 24/7 server protection
- ❌ Critical security operations
- ❌ Production environments
- ❌ Important Discord servers

---

## 🚀 **Quick Migration to VPS**

### **Once You're Ready to Upgrade:**

1. **Choose a VPS provider** (see recommendations above)
2. **Install Ubuntu/Node.js** on your VPS
3. **Copy your config.yml** to the VPS
4. **Run:** `npm install && node index.js`
5. **Enjoy 24/7 protection!**

**Remember: Android = Testing, VPS = Production! 🛡️**
