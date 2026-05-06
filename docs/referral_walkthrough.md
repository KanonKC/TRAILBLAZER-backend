# Walkthrough: Referral System Implementation

The referral system is now live! This system encourages growth by rewarding both inviters and their friends with extra widget quotas and storage.

## 🚀 Key Features

### 1. Milestone Rewards
Inviters earn rewards at specific referral counts:
- **1st Referral**: +1 Widget Quota
- **2nd Referral**: +15 MB Storage
- **3rd Referral**: +1 Widget Quota
- **Referee (Friend)**: Gets +1 Widget Quota immediately upon registration.

### 2. Secure Referral Links
Referral links use a unique 10-character hashed code derived from the user's Twitch ID (e.g., `?ref=A1B2C3D4E5`). This keeps IDs private while ensuring uniqueness.

### 3. Integrated UI
- **Navbar Button**: A prominent "Invite Friends" button is now visible to all logged-in users.
- **Referral Modal**: A dedicated modal displays the referral link, current referral count, and milestone progress.
- **Auto-tracking**: The system automatically captures referral codes from URLs and persists them through the Twitch login flow.

## 🛠 Technical Implementation

### Database
Two new tables were added:
- `Referral`: Tracks successful registrations.
- `ReferralCode`: Stores the hashed codes for each user.

### Backend
- **`ReferralService`**: Centralizes the logic for generating codes and applying rewards. It uses Prisma's `increment` to safely update user quotas and storage.
- **`UserController`**: Exposes the `/api/v1/user/referral-status` endpoint.
- **OAuth Integration**: The referral code is passed through the Twitch `state` parameter to ensure it survives the redirect flow.

### Frontend
- **`ReferralTracker`**: A client-side component that monitors URL parameters and stores them in a `blaze_ref` cookie.
- **`ReferralDialog`**: A shadcn-based dialog for a premium user experience.

## 🧪 Verification Steps
1. Log in and click the **Invite Friends** button in the Navbar.
2. Copy your unique link.
3. Use the link in a private/incognito window to register a new account.
4. Verify that both accounts received their respective rewards!

---
*Implementation completed on 2026-05-06.*
