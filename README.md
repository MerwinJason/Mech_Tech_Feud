# 🎯 MechTechFeud

Family Feud, but for tech teams. A real-time, zero-build, Firebase-powered web application designed for corporate tech nights.

## Features
- **Host Control Panel:** Upload questions via Excel, control the board, manage strikes, and handle steals.
- **Projector Display View:** A beautiful, animated big-screen view that auto-scales. Features dynamic grid layouts (for 3-8 answers), sound effects, and confetti.
- **Player Buzzers:** Real-time phone buzzers for head-to-head face-offs.

## ⚙️ Setup & Deployment

This app is entirely static (HTML/CSS/JS) and can be hosted directly on GitHub Pages. It uses Firebase Realtime Database for state synchronization.

### 1. Firebase Configuration

This app reuses your existing QuizBuzz Firebase project. 

1. Open `firebase-config.js`.
2. Paste the `firebaseConfig` object from your existing QuizBuzz app into this file.
3. Go to the Firebase console → Realtime Database → Rules.
4. Add the `feud-rooms` node to your existing rules. It should look like this:

```json
{
  "rules": {
    "quiz-rooms": {
      "$roomCode": {
        ".read": true,
        ".write": true
      }
    },
    "feud-rooms": {
      "$roomCode": {
        ".read": true,
        ".write": true
      }
    }
  }
}
```

### 2. Deploy to GitHub Pages

1. Push this repository to GitHub.
2. Go to repository Settings → Pages.
3. Under "Build and deployment", set Source to "Deploy from a branch".
4. Select the `main` branch and `/ (root)` folder, then click Save.
5. Your app will be live at `https://<your-username>.github.io/MechTechFeud/`.

## 📁 Question Format (Excel)

Questions are uploaded by the Host via an Excel `.xlsx` file.

**Format Rules:**
- Row 1 must contain headers: `Question`, `Ans 1`, `Pts 1`, `Ans 2`, `Pts 2`, ..., `Ans 8`, `Pts 8`
- You must provide at least 3 answers per question, and a maximum of 8.
- Points must be positive integers.
- Empty cells at the end of a row are ignored.

### Generating a Template
Since the app doesn't bundle a binary `.xlsx` file directly, you can generate a sample template locally using Node.js:

1. Open your terminal in this directory.
2. Run `npm install xlsx`
3. Run `node generate_template.js`
4. A file named `template.xlsx` will be generated, ready to be used or modified.

## 🎮 Gameplay Guide

1. **Start:** The MC clicks "Host a Room".
2. **Display:** In a separate tab (or dragged to a projector), click "Open Display" and enter the generated Room Code. Press F11 for fullscreen.
3. **Upload:** Upload your configured `.xlsx` file.
4. **Teams:** Enable the teams you want to play.
5. **Play:** Click "Open Lobby". 
   - Use "Introduce Round" for a dramatic intro on the big screen.
   - Click hidden rows on your host control panel to reveal them.
   - Assign points to a specific team when a guess is correct.
   - Use the "Strike" button for wrong guesses. At 3 strikes, you will be prompted to start a "Steal" round.
   - Toggle "Buzzers" to ON when you want two players to face off for board control. Players join the room on their phones by scanning the QR code.

## 🔊 Audio Note
Sounds (Ding, Strike, Steal, Reveal) are synthesized procedurally in real-time using the browser's Web Audio API, meaning no external `.mp3` files need to be downloaded or cached!
