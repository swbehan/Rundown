import * as WebBrowser from 'expo-web-browser'
import * as AuthSession from 'expo-auth-session'
import { supabase } from './supabase'

WebBrowser.maybeCompleteAuthSession()

const STRAVA_CLIENT_ID = process.env.EXPO_PUBLIC_STRAVA_CLIENT_ID
const STRAVA_AUTH_URL = 'https://www.strava.com/oauth/mobile/authorize'
const STRAVA_TOKEN_URL = 'https://www.strava.com/oauth/token'

export async function connectStrava() {
    const redirectUri = AuthSession.makeRedirectUri({
      scheme: 'strideai',
      path: 'redirect'
    })
  
    console.log('Redirect URI:', redirectUri)
  
    const authUrl = `${STRAVA_AUTH_URL}?client_id=${STRAVA_CLIENT_ID}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&approval_prompt=auto&scope=activity:read_all,profile:read_all`
  
    const result = await WebBrowser.openAuthSessionAsync(authUrl, redirectUri)
  
    console.log('Auth result type:', result.type)
  
    if (result.type !== 'success') {
      throw new Error('Strava connection cancelled')
    }
  
    // Extract code from URL
    const code = result.url.split('code=')[1]?.split('&')[0]
    console.log('Code extracted:', code ? 'yes' : 'no')
  
    // Get session
    const { data: { session } } = await supabase.auth.getSession()
    console.log('Session:', session ? 'yes' : 'no')
  
    const userId = session?.user?.id
    console.log('User ID:', userId)
  
    if (!userId) throw new Error('Not logged in — please sign out and sign back in')
  
    console.log('Invoking edge function with:', {
      code: code ? 'yes' : 'no',
      userId
    })
  
    const { data, error } = await supabase.functions.invoke('strava-auth', {
      body: JSON.stringify({ code, userId }),
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`
      }
    })
  
    console.log('Data:', JSON.stringify(data))
    console.log('Error:', JSON.stringify(error))
  
    if (error) throw error
    return data
  }

export async function getStravaActivities(accessToken, after) {
  const response = await fetch(
    `https://www.strava.com/api/v3/athlete/activities?after=${after}&per_page=30`,
    {
      headers: { Authorization: `Bearer ${accessToken}` }
    }
  )
  return response.json()
}

export async function refreshStravaToken(refreshToken) {
  const response = await fetch(STRAVA_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: STRAVA_CLIENT_ID,
      client_secret: process.env.STRAVA_CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type: 'refresh_token'
    })
  })
  return response.json()
}