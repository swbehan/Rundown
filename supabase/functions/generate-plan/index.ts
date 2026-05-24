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
    const { userId, planName, goalMileage, injuryDescription, currentFitness, additionalContext } = body

    console.log('Generating plan for user:', userId)

    const today = new Date().toISOString().split('T')[0]

    const prompt = `Running coach. Raw JSON only. No backticks. Start with {

Injury: ${injuryDescription}
Fitness: ${currentFitness}
Goal: ${goalMileage} miles/week
Context: ${additionalContext}
Today: ${today}

Return ONLY this JSON with max 3 phases, very brief text:
{"name":"${planName}","goalMileage":${goalMileage},"startDate":"${today}","endDate":"YYYY-MM-DD","aiInsight":"one sentence","checkinQuestions":[{"question":"Injury feeling?","responseType":"scale_1_5","responseKey":"injury_feeling","order":0}],"phases":[{"name":"Phase 1","description":"brief","type":"cross_training","order":0,"startDate":"${today}","endDate":"YYYY-MM-DD","weeklyMileage":0,"runDays":["Monday","Wednesday","Friday","Saturday"],"runDayTasks":[{"title":"Easy Run","category":"run","targetValue":"3 miles"}],"restDayTasks":[{"title":"Foam roll","category":"stretching","targetValue":"10 min"}]}]}`

    console.log('Calling Claude...')
    const claudeResponse = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': Deno.env.get('ANTHROPIC_API_KEY'),
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1500,
        messages: [{ role: 'user', content: prompt }]
      })
    })

    const claudeData = await claudeResponse.json()
    console.log('Claude type:', claudeData.type)

    if (claudeData.type === 'error') {
      throw new Error('Claude: ' + claudeData.error.message)
    }

    const responseText = claudeData.content[0].text
    console.log('Response:', responseText.substring(0, 150))

    let planData
    const jsonStart = responseText.indexOf('{')
    const jsonEnd = responseText.lastIndexOf('}')
    if (jsonStart === -1 || jsonEnd === -1) {
      throw new Error('No JSON found: ' + responseText.substring(0, 100))
    }
    try {
      planData = JSON.parse(responseText.substring(jsonStart, jsonEnd + 1))
    } catch (e) {
      throw new Error('Parse failed: ' + responseText.substring(jsonStart, jsonStart + 100))
    }

    console.log('Parsed! Phases:', planData.phases?.length)

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL'),
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    )

    // Save plan
    const { data: plan, error: planError } = await supabase
      .from('plans')
      .insert({
        user_id: userId,
        name: planData.name,
        goal_mileage: planData.goalMileage,
        start_date: planData.startDate,
        end_date: planData.endDate,
        active: true,
        ai_context: JSON.stringify({
          injuryDescription,
          currentFitness,
          additionalContext,
          phases: planData.phases,
        }),
      })
      .select()
      .single()

    if (planError) throw planError
    console.log('Plan saved:', plan.id)

    // Save phases only — no plan days yet, generate-daily-tasks handles those
    for (const phase of planData.phases) {
      await supabase
        .from('plan_phases')
        .insert({
          plan_id: plan.id,
          name: phase.name,
          description: phase.description,
          phase_order: phase.order,
          start_date: phase.startDate,
          end_date: phase.endDate,
          phase_type: phase.type,
        })
    }

    // Save checkin questions
    if (planData.checkinQuestions) {
      await supabase.from('checkin_questions').insert(
        planData.checkinQuestions.map(q => ({
          plan_id: plan.id,
          question: q.question,
          response_type: q.responseType,
          response_key: q.responseKey,
          question_order: q.order,
        }))
      )
    }

    console.log('Plan structure saved! Daily tasks will generate tonight.')

    return new Response(
      JSON.stringify({ success: true, plan: { ...planData, id: plan.id } }),
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
