import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const body = await req.json()
    console.log('Body:', JSON.stringify(body))

    const code = body.code
    const userId = body.userId

    console.log('code:', code ? 'yes' : 'no')
    console.log('userId:', userId ? 'yes' : 'no')

    if (!code || !userId) {
      throw new Error('Missing code or userId')
    }

    const tokenResponse = await fetch('https://www.strava.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: Deno.env.get('STRAVA_CLIENT_ID'),
        client_secret: Deno.env.get('STRAVA_CLIENT_SECRET'),
        code: code,
        grant_type: 'authorization_code',
      }),
    })

    const tokenData = await tokenResponse.json()
    console.log('Strava response keys:', Object.keys(tokenData))

    if (!tokenData.athlete) {
      throw new Error('No athlete in response: ' + JSON.stringify(tokenData))
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL'),
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    )

    const { error } = await supabase
      .from('user_integrations')
      .upsert({
        user_id: userId,
        provider: 'strava',
        access_token: tokenData.access_token,
        refresh_token: tokenData.refresh_token,
        token_expires_at: new Date(tokenData.expires_at * 1000).toISOString(),
        provider_user_id: String(tokenData.athlete.id),
      })

    if (error) throw error

    return new Response(
      JSON.stringify({ success: true, athlete: tokenData.athlete }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (err) {
    console.error('Error:', err.message)
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
