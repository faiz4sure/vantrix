# 🔑 How to Get Your Discord User Token

## ⚠️ **CRITICAL SECURITY WARNING**

> **Your Discord token is like your account password - NEVER share it with anyone!**

### **Legal & Safety Notice:**
- **Selfbots violate Discord's Terms of Service**
- **Your account may be banned if detected**
- **Use alternate accounts, never your main account**
- **We are not responsible for any consequences**
- **This guide is for educational purposes only**

---

## 📱 **Method 1: Android (BlueCord App)**

### **What is BlueCord?**
BlueCord is a modified Discord client that makes token extraction easier on mobile devices.

### **Installation Steps:**

1. **Download BlueCord APK**
   - Search "BlueCord Discord APK" in your browser
   - Download from trusted sources only
   - ⚠️ **Scan with antivirus before installing**

2. **Install & Login**
   - Install the APK file
   - Open BlueCord and login to Discord
   - Complete 2FA if enabled

3. **Extract Token**
   - Tap the **Settings gear** in BlueCord
   - Scroll down to **"Bluecord Mods"**
   - Tap **"Account Switcher"**
   - Select **"Copy Current Token"**
   - Your token is now in clipboard

4. **Use in Vantrix**
   - Open `config.yml`
   - Replace `token: ""` with your copied token
   - Save the file

---

## 💻 **Method 2: Desktop App (Developer Console)**

### **For Discord Desktop App:**

1. **Open Discord Desktop**
   - Launch the Discord desktop application
   - Make sure you're logged in

2. **Open Developer Tools**
   - Press `Ctrl + Shift + I` (Windows/Linux)
   - Or `Cmd + Option + I` (Mac)
   - Click the **"Console"** tab

3. **Extract Token**
   - Copy and paste this code:

```javascript
window.webpackChunkdiscord_app.push([
  [Symbol()],
  {},
  (req) => {
    if (!req.c) return;
    for (let m of Object.values(req.c)) {
      try {
        if (!m.exports || m.exports === window) continue;
        if (m.exports?.getToken) return copy(m.exports.getToken());
        for (let ex in m.exports) {
          if (
            m.exports?.[ex]?.getToken &&
            m.exports[ex][Symbol.toStringTag] !== "IntlMessagesProxy"
          )
            return copy(m.exports[ex].getToken());
        }
      } catch {}
    }
  },
]);
window.webpackChunkdiscord_app.pop();
console.log("%cToken copied to clipboard!", "font-size: 20px; color: green;");
```

4. **Execute Code**
   - Press Enter
   - You should see "Token copied to clipboard!" message
   - Your token is now copied

---

## 🌐 **Method 3: Web Browser (Chrome/Edge/Firefox)**

### **Browser Console Method:**

1. **Open Discord Web**
   - Go to https://discord.com/app
   - Login to your account

2. **Open Developer Tools**
   - Press `F12` or `Ctrl + Shift + I`
   - Click the **"Console"** tab

3. **Run Token Code**
   - Paste the same JavaScript code from Method 2
   - Press Enter
   - Token will be copied to clipboard

### **Network Tab Method (Advanced):**

1. **Open Network Tab**
   - Press `F12` → **"Network"** tab
   - Type `api/v` in the filter box

2. **Trigger API Request**
   - Send any message in Discord
   - Look for API requests in the list

3. **Extract from Headers**
   - Click on any `messages` or `channels` request
   - Go to **"Headers"** tab
   - Find **"authorization"** header
   - Copy the long token value

---

## 📱 **Method 4: Mobile Browser**

### **For Phone Browsers:**

1. **Enable Desktop Mode**
   - Open Chrome/Safari/Firefox on your phone
   - Go to https://discord.com/app
   - Enable "Request Desktop Site" in browser menu

2. **Access Developer Tools**
   - Tap browser menu → **"Developer Tools"** or **"Inspect"**
   - Navigate to **"Console"** tab

3. **Extract Token**
   - Paste the JavaScript code from Method 2
   - Execute and copy the token

---

## 🛠️ **Method 5: Alternative Tools (Use with Caution)**

### **⚠️ HIGH RISK - Use Only Trusted Tools**

Many token extractors contain malware. Only use if you know what you're doing:

- **BetterDiscord Plugins** (if you use BetterDiscord)
- **Open-source token extractors** from GitHub
- **Browser extensions** (scan with antivirus first)

**Recommendation:** Stick to the console methods above - they're safer!

---

## 📝 **Using Your Token in Vantrix**

### **1. Open config.yml**
```yaml
selfbot:
  token: ""  # ← Paste your token here
```

### **2. Replace with Your Token**
```yaml
selfbot:
  token: "MTEzMjMzODI1ND..."
```

### **3. Save & Start**
```bash
node index.js
```

---

## 🔒 **Token Security Best Practices**

### **Protect Your Token:**
- 🔴 **Never share it publicly**
- 🔴 **Don't paste in untrusted websites**
- 🔴 **Use environment variables for extra security**
- 🟢 **Regenerate if compromised**

### **If Token is Stolen:**
1. **Change Discord password immediately**
2. **Enable 2FA** on your account
3. **Check recent activity**
4. **Consider account recovery**

---

## ❓ **Troubleshooting**

### **"Invalid token" Error:**
- Check for extra spaces around the token
- Ensure token is in quotes: `token: "YOUR_TOKEN"`
- Try getting a fresh token

### **Console Code Not Working:**
- Refresh Discord and try again
- Try different browser (Chrome recommended)
- Clear browser cache/cookies

### **Mobile Issues:**
- Use desktop mode in mobile browser
- Try different mobile browser
- Use BlueCord app method instead

---

## 📞 **Need Help?**

- **Join Support Server:** https://discord.gg/NUPbGzY8Be
- **GitHub Issues:** https://github.com/faiz4sure/vantrix/issues
- **Developer:** `faiz4sure`

---

## ⚖️ **Final Reminder**

**Selfbots = Account Ban Risk**
- Use alternate accounts only
- Don't use for spamming/abuse
- Accept the risks involved
- Educational purposes only

**Stay safe and don't get caught! 🛡️**
