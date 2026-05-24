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
    const { userId, currentProposal, currentGoals, userMessage, planContext } = await req.json()

    const prompt = `You are an expert running coach. The athlete wants to adjust their week plan proposal.

Current proposal: ${currentProposal}
Current goals: ${JSON.stringify(currentGoals)}
Plan context: ${JSON.stringify(planContext)}

Athlete's request: "${userMessage}"

Adjust the proposal based on their feedback. Keep it practical and specific.

Respond ONLY with this JSON:
{"weekProposal":"updated 1-2 sentence proposal","nextWeekGoals":["goal 1","goal 2","goal 3"]}`

    const claudeResponse = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': Deno.env.get('ANTHROPIC_API_KEY'),
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 400,
        messages: [{ role: 'user', content: prompt }]
      })
    })

    const claudeData = await claudeResponse.json()
    if (claudeData.type === 'error') {
      return new Response(JSON.stringify({ error: claudeData.error.message }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const responseText = claudeData.content[0].text
    const jsonStart = responseText.indexOf('{')
    const jsonEnd = responseText.lastIndexOf('}')
    const adjusted = JSON.parse(responseText.substring(jsonStart, jsonEnd + 1))

    // Update the daily_checkins record with the new proposal
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL'),
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    )

    const today = new Date()
    // Find the Sunday week review (within last 2 days)
    const twoDaysAgo = new Date(today)
    twoDaysAgo.setDate(today.getDate() - 2)

    const { data: checkin } = await supabase
      .from('daily_checkins')
      .select('*')
      .eq('user_id', userId)
      .gte('date', twoDaysAgo.toISOString().split('T')[0])
      .order('date', { ascending: false })
      .limit(1)
      .single()

    if (checkin) {
      await supabase
        .from('daily_checkins')
        .update({
          responses: {
            ...checkin.responses,
            weekProposal: adjusted.weekProposal,
            nextWeekGoals: adjusted.nextWeekGoals,
          },
          ai_followup: adjusted.weekProposal,
        })
        .eq('id', checkin.id)
    }

    return new Response(JSON.stringify(adjusted), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (err) {
    console.error('Error:', err.message)
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
