import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Strava webhook verification
  if (req.method === 'GET') {
    const url = new URL(req.url)
    const mode = url.searchParams.get('hub.mode')
    const token = url.searchParams.get('hub.verify_token')
    const challenge = url.searchParams.get('hub.challenge')

    if (mode === 'subscribe' && token === Deno.env.get('STRAVA_VERIFY_TOKEN')) {
      console.log('Webhook verified!')
      return new Response(
        JSON.stringify({ 'hub.challenge': challenge }),
        { headers: { 'Content-Type': 'application/json' } }
      )
    }
    return new Response('Forbidden', { status: 403 })
  }

  if (req.method === 'POST') {
    try {
      const event = await req.json()
      console.log('Webhook event:', JSON.stringify(event))

      if (event.object_type !== 'activity' || event.aspect_type !== 'create') {
        return new Response('OK', { status: 200 })
      }

      const stravaAthleteId = String(event.owner_id)
      const stravaActivityId = event.object_id

      const supabase = createClient(
        Deno.env.get('SUPABASE_URL'),
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
      )

      // Find user by Strava athlete ID
      const { data: integration, error: integrationError } = await supabase
        .from('user_integrations')
        .select('user_id, access_token, refresh_token, token_expires_at')
        .eq('provider', 'strava')
        .eq('provider_user_id', stravaAthleteId)
        .single()

      if (integrationError || !integration) {
        console.error('No user found for athlete:', stravaAthleteId)
        return new Response('OK', { status: 200 })
      }

      // Refresh token if expired
      let accessToken = integration.access_token
      const expiresAt = new Date(integration.token_expires_at)

      if (expiresAt < new Date()) {
        console.log('Token expired, refreshing...')
        const refreshResponse = await fetch('https://www.strava.com/oauth/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            client_id: Deno.env.get('STRAVA_CLIENT_ID'),
            client_secret: Deno.env.get('STRAVA_CLIENT_SECRET'),
            refresh_token: integration.refresh_token,
            grant_type: 'refresh_token',
          }),
        })
        const refreshData = await refreshResponse.json()
        accessToken = refreshData.access_token

        await supabase
          .from('user_integrations')
          .update({
            access_token: refreshData.access_token,
            refresh_token: refreshData.refresh_token,
            token_expires_at: new Date(refreshData.expires_at * 1000).toISOString(),
          })
          .eq('user_id', integration.user_id)
          .eq('provider', 'strava')
      }

      // Fetch full activity from Strava
      const activityResponse = await fetch(
        `https://www.strava.com/api/v3/activities/${stravaActivityId}`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      )
      const activity = await activityResponse.json()
      console.log('Activity fetched:', activity.name, activity.type)

      // Save activity to database
    const { error: saveError } = await supabase
    .from('strava_activities')
    .upsert({
      user_id: integration.user_id,
      strava_id: stravaActivityId,
      name: activity.name,
      distance_meters: activity.distance,
      moving_time_seconds: activity.moving_time,
      elapsed_time_seconds: activity.elapsed_time,
      avg_pace_per_km: activity.moving_time / (activity.distance / 1000),
      avg_heartrate: activity.average_heartrate,
      max_heartrate: activity.max_heartrate,
      elevation_gain: activity.total_elevation_gain,
      start_date: activity.start_date,
      activity_type: activity.type,
    }, { onConflict: 'strava_id' })

      if (saveError) {
        console.error('Error saving activity:', saveError)
      } else {
        console.log('Activity saved!')
      }

      // Always try to complete matching task
      console.log('Checking for tasks to complete...')
      const activityDate = activity.start_date.split('T')[0]
      console.log('Activity date:', activityDate)

      const { data: planDay } = await supabase
        .from('plan_days')
        .select('id')
        .eq('date', activityDate)
        .single()

      if (planDay) {
        console.log('Found plan day:', planDay.id)

        const activityTypeMap = {
          'Run': 'run',
          'Ride': 'bike',
          'Swim': 'swim',
          'Elliptical': 'elliptical',
          'VirtualRide': 'bike',
          'Walk': 'run',
          'Hike': 'run',
          'VirtualRun': 'run',
        }
        const mappedCategory = activityTypeMap[activity.type] || 'cross_training'
        console.log('Mapped category:', mappedCategory)

        const stravaCategories = ['run', 'long_run', 'bike', 'elliptical', 'swim', 'cross_training']

        const { data: tasks } = await supabase
          .from('tasks')
          .select('*')
          .eq('plan_day_id', planDay.id)
          .in('category', stravaCategories)
          .eq('completed', false)

        console.log('Incomplete cardio tasks found:', tasks?.length || 0)

        if (tasks && tasks.length > 0) {
          const taskToComplete = tasks.find(t => t.category === mappedCategory) || tasks[0]
          console.log('Completing task:', taskToComplete.title)

          await supabase
            .from('tasks')
            .update({
              completed: true,
              completed_at: new Date().toISOString(),
            })
            .eq('id', taskToComplete.id)

          console.log('Task completed successfully!')
        } else {
          console.log('No incomplete cardio tasks for today')
        }
      } else {
        console.log('No plan day found for date:', activityDate)
      }

      // Send push notification
      const distanceMiles = (activity.distance / 1609).toFixed(1)
      const pace = activity.moving_time && activity.distance
        ? (() => {
            const secsPerMile = (activity.moving_time / (activity.distance / 1609))
            const mins = Math.floor(secsPerMile / 60)
            const secs = Math.round(secsPerMile % 60)
            return `${mins}:${secs.toString().padStart(2, '0')}/mi`
          })()
        : null

      const notifBody = pace
        ? `${distanceMiles} mi @ ${pace} synced from Strava`
        : `${distanceMiles} mi synced from Strava`

      const { data: userData } = await supabase
        .from('users')
        .select('push_token')
        .eq('id', integration.user_id)
        .single()

      if (userData?.push_token) {
        await fetch('https://exp.host/--/api/v2/push/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            to: userData.push_token,
            title: 'Activity synced',
            body: notifBody,
          }),
        })
      }

      return new Response('OK', { status: 200 })

    } catch (err) {
      console.error('Webhook error:', err.message)
      return new Response('OK', { status: 200 })
    }
  }

  return new Response('Method not allowed', { status: 405 })
})
