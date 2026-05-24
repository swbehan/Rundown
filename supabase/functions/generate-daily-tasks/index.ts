import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

serve(async (req) => {
  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL'),
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    )

    let body = {}
    try {
      const text = await req.text()
      body = text ? JSON.parse(text) : {}
    } catch (_) {}
    const forceWeekReview = body.forceWeekReview === true

    const { data: users } = await supabase.from('users').select('id, name')
    if (!users || users.length === 0) {
      return new Response('No users', { status: 200 })
    }

    // Cron fires at 4am UTC = midnight EDT (UTC-4)
    // On Monday UTC = Sunday midnight EDT → generate week review
    const now = new Date()
    const isMonday = now.getUTCDay() === 1

    for (const user of users) {
      await generateToday(supabase, user, now)
      await generateDayReview(supabase, user, now)
      if (isMonday || forceWeekReview) {
        await generateWeekReview(supabase, user, now)
      }
      await sendPushNotification(supabase, user.id, 'Day review ready', "Your day review is ready and today's plan is set.")
    }

    return new Response('Done', { status: 200 })
  } catch (err) {
    console.error('Error:', err.message)
    return new Response(err.message, { status: 500 })
  }
})

async function generateToday(supabase, user, now) {
  console.log('Generating today for user:', user.id)

  const { data: plans } = await supabase
    .from('plans')
    .select('*, plan_phases(*)')
    .eq('user_id', user.id)
    .eq('active', true)

  if (!plans || plans.length === 0) return

  const plan = plans[0]
  const todayStr = now.toISOString().split('T')[0]

  // Skip if today already has tasks
  const { data: existing } = await supabase
    .from('plan_days')
    .select('id, tasks(*)')
    .eq('plan_id', plan.id)
    .eq('date', todayStr)
    .single()

  if (existing?.tasks?.length > 0) {
    console.log('Today already has tasks, skipping generation')
    return
  }

  // Get yesterday's Strava activity for context/adjustment
  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  const { data: yesterdayActivity } = await supabase
    .from('strava_activities')
    .select('*')
    .eq('user_id', user.id)
    .gte('start_date', yesterday.toISOString().split('T')[0])
    .order('start_date', { ascending: false })
    .limit(1)

  const currentPhase = plan.plan_phases?.find(p =>
    p.start_date <= todayStr && p.end_date >= todayStr
  )

  if (!currentPhase) return

  const context = {
    plan: { name: plan.name, goalMileage: plan.goal_mileage, aiContext: plan.ai_context },
    currentPhase: { name: currentPhase.name, description: currentPhase.description },
    today: { date: todayStr, dayOfWeek: now.toLocaleDateString('en-US', { weekday: 'long' }) },
    yesterdayActivity: yesterdayActivity?.[0] ? {
      type: yesterdayActivity[0].activity_type,
      distanceMiles: (yesterdayActivity[0].distance_meters / 1609).toFixed(2),
      movingTimeMinutes: Math.round(yesterdayActivity[0].moving_time_seconds / 60),
    } : null
  }

  const prompt = `Running coach. Generate today's tasks as JSON only.

${JSON.stringify(context)}

Rules:
- If today is a rest day, use an EMPTY tasks array: "tasks": []
- NEVER generate a "Rest", "Recovery", or "Rest and Recovery" task

Respond ONLY with:
{"date":"${todayStr}","label":"brief label","notes":"coaching note","tasks":[{"title":"task","category":"run|long_run|bike|elliptical|swim|cross_training|strength|isometric|stretching|mobility|supplement|medication|nutrition","targetValue":"target","taskOrder":0}]}`

  const claudeResponse = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': Deno.env.get('ANTHROPIC_API_KEY'),
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1000,
      messages: [{ role: 'user', content: prompt }]
    })
  })

  const claudeData = await claudeResponse.json()
  if (claudeData.type === 'error') return

  const responseText = claudeData.content[0].text
  const jsonStart = responseText.indexOf('{')
  const jsonEnd = responseText.lastIndexOf('}')
  if (jsonStart === -1 || jsonEnd === -1) return

  let dayData
  try {
    dayData = JSON.parse(responseText.substring(jsonStart, jsonEnd + 1))
  } catch (e) { return }

  // Delete existing plan day for today if any
  await supabase.from('plan_days').delete().eq('plan_id', plan.id).eq('date', todayStr)

  const { data: planDay } = await supabase
    .from('plan_days')
    .insert({
      plan_id: plan.id,
      phase_id: currentPhase.id,
      date: todayStr,
      label: dayData.label,
      notes: dayData.notes,
      completed: false,
    })
    .select()
    .single()

  if (planDay && dayData.tasks?.length > 0) {
    await supabase.from('tasks').insert(
      dayData.tasks.map((t, i) => ({
        plan_day_id: planDay.id,
        title: t.title,
        category: t.category,
        target_value: t.targetValue,
        task_order: t.taskOrder || i,
        completed: false,
      }))
    )
  }

  console.log('Today generated for user:', user.id)
}

async function generateDayReview(supabase, user, now) {
  // Review yesterday's tasks (the day that just ended at midnight)
  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  const yesterdayStr = yesterday.toISOString().split('T')[0]

  const { data: planDays } = await supabase
    .from('plan_days')
    .select('*, tasks(*)')
    .eq('date', yesterdayStr)

  if (!planDays || planDays.length === 0) return

  const allTasks = planDays.flatMap(pd => pd.tasks || [])
  const completedTasks = allTasks.filter(t => t.completed)
  const missedTasks = allTasks.filter(t => !t.completed)

  const { data: yesterdayActivity } = await supabase
    .from('strava_activities')
    .select('*')
    .eq('user_id', user.id)
    .gte('start_date', yesterdayStr)
    .lt('start_date', now.toISOString().split('T')[0])
    .order('start_date', { ascending: false })
    .limit(1)

  const context = {
    date: yesterdayStr,
    completed: completedTasks.map(t => t.title),
    missed: missedTasks.map(t => t.title),
    stravaActivity: yesterdayActivity?.[0] ? {
      type: yesterdayActivity[0].activity_type,
      distanceMiles: (yesterdayActivity[0].distance_meters / 1609).toFixed(2),
      pace: formatPace(yesterdayActivity[0].avg_pace_per_km * 1.609),
    } : null
  }

  const prompt = `Running coach. Generate a brief day review as JSON only.

${JSON.stringify(context)}

Respond ONLY with:
{"summary":"2-3 honest sentences","score":1-10,"missedItems":["list"],"stravaInsight":"pace/effort analysis or null"}`

  const claudeResponse = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': Deno.env.get('ANTHROPIC_API_KEY'),
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 500,
      messages: [{ role: 'user', content: prompt }]
    })
  })

  const claudeData = await claudeResponse.json()
  if (claudeData.type === 'error') return

  const responseText = claudeData.content[0].text
  const jsonStart = responseText.indexOf('{')
  const jsonEnd = responseText.lastIndexOf('}')
  if (jsonStart === -1 || jsonEnd === -1) return

  let reviewData
  try {
    reviewData = JSON.parse(responseText.substring(jsonStart, jsonEnd + 1))
  } catch (e) { return }

  // Delete existing review for yesterday then insert fresh
  await supabase.from('daily_checkins').delete()
    .eq('user_id', user.id)
    .eq('date', yesterdayStr)

  await supabase.from('daily_checkins').insert({
    user_id: user.id,
    plan_day_id: planDays[0].id,
    date: yesterdayStr,
    responses: {
      summary: reviewData.summary,
      score: reviewData.score,
      completedItems: completedTasks.map(t => t.title),
      missedItems: reviewData.missedItems,
      stravaInsight: reviewData.stravaInsight,
    },
    ai_followup: reviewData.summary,
  })

  console.log('Day review saved for user:', user.id)
}

async function generateWeekReview(supabase, user, now) {
  console.log('Generating week review for user:', user.id)

  const { data: plans } = await supabase
    .from('plans')
    .select('*, plan_phases(*)')
    .eq('user_id', user.id)
    .eq('active', true)

  if (!plans || plans.length === 0) return
  const plan = plans[0]

  // Get last 7 days (Mon-Sun that just ended)
  const sunday = new Date(now)
  sunday.setDate(now.getDate() - 1) // yesterday = last Sunday
  const monday = new Date(sunday)
  monday.setDate(sunday.getDate() - 6)
  const mondayStr = monday.toISOString().split('T')[0]
  const sundayStr = sunday.toISOString().split('T')[0]

  const { data: planDays } = await supabase
    .from('plan_days')
    .select('*, tasks(*)')
    .eq('plan_id', plan.id)
    .gte('date', mondayStr)
    .lte('date', sundayStr)
    .order('date', { ascending: true })

  const { data: activities } = await supabase
    .from('strava_activities')
    .select('*')
    .eq('user_id', user.id)
    .gte('start_date', mondayStr)
    .order('start_date', { ascending: true })

  const allTasks = (planDays || []).flatMap(pd => pd.tasks || [])
  const completedTasks = allTasks.filter(t => t.completed)
  const completionRate = allTasks.length > 0
    ? Math.round((completedTasks.length / allTasks.length) * 100)
    : 0
  const totalMiles = (activities || []).reduce((sum, a) => sum + (a.distance_meters / 1609), 0)

  const nowStr = now.toISOString().split('T')[0]
  const currentPhase = plan.plan_phases?.find(p => p.start_date <= nowStr && p.end_date >= nowStr)

  const context = {
    plan: { name: plan.name, goalMileage: plan.goal_mileage, aiContext: plan.ai_context },
    currentPhase: currentPhase ? { name: currentPhase.name, description: currentPhase.description } : null,
    weekStats: {
      totalMilesRun: totalMiles.toFixed(1),
      tasksCompleted: completedTasks.length,
      totalTasks: allTasks.length,
      completionRate: `${completionRate}%`,
      activeDays: (activities || []).length,
    },
    activities: (activities || []).map(a => ({
      date: a.start_date?.split('T')[0],
      type: a.activity_type,
      distanceMiles: (a.distance_meters / 1609).toFixed(2),
      pace: formatPace(a.avg_pace_per_km * 1.609),
      avgHeartrate: a.avg_heartrate,
    })),
    missedTaskTitles: allTasks.filter(t => !t.completed).map(t => t.title),
  }

  const prompt = `You are an expert running coach. Generate a weekly review and next week proposal.

${JSON.stringify(context)}

Respond ONLY with this JSON:
{"weekSummary":"2-3 honest sentences about this week","weekProposal":"1-2 sentences proposing next week's focus and key goals","nextWeekGoals":["goal 1","goal 2","goal 3"]}`

  const claudeResponse = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': Deno.env.get('ANTHROPIC_API_KEY'),
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 600,
      messages: [{ role: 'user', content: prompt }]
    })
  })

  const claudeData = await claudeResponse.json()
  if (claudeData.type === 'error') return

  const responseText = claudeData.content[0].text
  const jsonStart = responseText.indexOf('{')
  const jsonEnd = responseText.lastIndexOf('}')
  if (jsonStart === -1 || jsonEnd === -1) return

  let reviewData
  try {
    reviewData = JSON.parse(responseText.substring(jsonStart, jsonEnd + 1))
  } catch (e) { return }

  // Save to next Monday's date (current week starts today)
  const nextMondayStr = nowStr

  await supabase.from('daily_checkins').delete()
    .eq('user_id', user.id)
    .eq('date', nextMondayStr)

  const { error: weekReviewError } = await supabase.from('daily_checkins').insert({
    user_id: user.id,
    plan_day_id: planDays?.[planDays.length - 1]?.id || planDays?.[0]?.id,
    date: nextMondayStr,
    responses: {
      isWeekReview: true,
      weekStats: context.weekStats,
      weekSummary: reviewData.weekSummary,
      weekProposal: reviewData.weekProposal,
      nextWeekGoals: reviewData.nextWeekGoals,
      confirmed: false,
    },
    ai_followup: reviewData.weekProposal,
  })

  if (weekReviewError) {
    console.error('Week review save error:', weekReviewError.message)
    return
  }

  console.log('Week review saved for user:', user.id)
}

async function sendPushNotification(supabase, userId, title, body) {
  try {
    const { data: user } = await supabase
      .from('users')
      .select('push_token')
      .eq('id', userId)
      .single()

    if (!user?.push_token) return

    await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to: user.push_token, title, body }),
    })
  } catch (err) {
    console.error('Push notification failed:', err)
  }
}

function formatPace(secondsPerMile) {
  if (!secondsPerMile) return null
  const minutes = Math.floor(secondsPerMile / 60)
  const seconds = Math.round(secondsPerMile % 60)
  return `${minutes}:${seconds.toString().padStart(2, '0')}/mi`
}
