# Rundown

An AI-powered training companion for runners and athletes. Rundown generates personalized daily training plans, syncs with Strava to automatically track completed workouts, and delivers nightly coaching feedback based on what you actually did versus what you planned.

---

## Features

- **AI Plan Generation** — Describe your goals, injury status, and preferences. Claude generates a fully personalized training plan with phases, run days, rest days, and daily tasks
- **Daily Task Checklist** — Tasks grouped by Cardio, Strength, Stretching, and Supplements. Each day is unique, generated the night before by Claude
- **Strava Auto-Complete** — Connect your Strava account and cardio tasks complete automatically when your activity syncs
- **Nightly AI Review** — Every night at 10pm, Claude reviews your day, compares planned vs actual, and generates tomorrow's tasks
- **Weekly Planning** — Every Sunday night, Claude generates a full personalized week ahead
- **Progress Tracking** — Weekly task completion strip, section breakdown, and recent Strava activity feed

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React Native (Expo) with expo-router |
| Backend | Supabase (PostgreSQL + Edge Functions + Realtime) |
| AI | Anthropic Claude API (claude-haiku) |
| Fitness Data | Strava API (OAuth + Webhooks) |
| Icons | Expo Vector Icons (Ionicons) |

---

## Project Structure

```
app/
├── _layout.js          # Root layout, auth state
├── index.js            # Login / signup
├── onboarding.js       # Plan creation flow
└── (tabs)/
    ├── today.js        # Daily task checklist
    ├── plan.js         # Plan management
    ├── progress.js     # Progress & Strava feed
    └── settings.js     # Account & integrations

lib/
├── supabase.js         # Supabase client
└── strava.js           # Strava OAuth + activity fetch

supabase/functions/
├── strava-auth/        # Strava OAuth token exchange
├── strava-webhook/     # Receives Strava activities, auto-completes tasks
├── generate-plan/      # Claude generates plan structure + phases
└── generate-daily-tasks/ # Nightly task generation + day review

constants/
└── colors.js           # Design system colors
```

---

## Getting Started

### Prerequisites
- Node.js v22+
- Expo CLI
- Xcode (for iOS simulator)
- Supabase account
- Strava API app
- Anthropic API key

### Installation

```bash
git clone https://github.com/swbehan/Rundown.git
cd Rundown
npm install --legacy-peer-deps
```

### Environment Variables

Create a `.env` file in the root:

```
EXPO_PUBLIC_SUPABASE_URL=your_supabase_url
EXPO_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
EXPO_PUBLIC_STRAVA_CLIENT_ID=your_strava_client_id
STRAVA_CLIENT_SECRET=your_strava_client_secret
```

### Supabase Setup

Add these secrets to your Supabase Edge Functions:
- `ANTHROPIC_API_KEY`
- `STRAVA_CLIENT_ID`
- `STRAVA_CLIENT_SECRET`
- `STRAVA_VERIFY_TOKEN`

### Run on iOS Simulator

```bash
npx expo run:ios
```

---

## How It Works

1. **Create a Plan** — Choose Running or Gym, fill in your details, and Claude generates a structured training plan with phases
2. **Daily Tasks** — Each morning your tasks are ready: what to run, what to lift, what to take
3. **Go Train** — Record your activity on Strava. It syncs automatically and marks your cardio task complete
4. **Nightly Review** — At 10pm Claude reviews your day and sets up tomorrow. On Sundays it plans the full week ahead

---

## Strava Webhook

Register the webhook with Strava after deploying:

```bash
curl -X POST https://www.strava.com/api/v3/push_subscriptions \
  -F client_id=YOUR_CLIENT_ID \
  -F client_secret=YOUR_CLIENT_SECRET \
  -F callback_url=https://YOUR_SUPABASE_URL/functions/v1/strava-webhook \
  -F verify_token=YOUR_VERIFY_TOKEN
```

---

## Deploy Edge Functions

```bash
supabase functions deploy strava-auth --no-verify-jwt
supabase functions deploy strava-webhook --no-verify-jwt
supabase functions deploy generate-plan --no-verify-jwt
supabase functions deploy generate-daily-tasks --no-verify-jwt
```

---

## Built By

Sean Behan — Northeastern University, Computer Science  
Co-op: Software Engineer in Test @ Bevi, Boston
