import { useState, useEffect } from 'react'
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { supabase } from '../../lib/supabase'
import colors from '../../constants/colors'
import { router } from 'expo-router'

const STRAVA_CATEGORIES = ['run', 'long_run', 'running', 'cross_training', 'bike', 'elliptical', 'swim']

const SECTIONS = [
  {
    key: 'cardio',
    label: 'CARDIO',
    icon: 'fitness',
    categories: ['run', 'long_run', 'running', 'cross_training', 'bike', 'elliptical', 'swim'],
    color: colors.run,
    stravaLocked: true,
  },
  {
    key: 'strength',
    label: 'STRENGTH',
    icon: 'barbell',
    categories: ['strength', 'pt', 'isometric'],
    color: colors.pt,
    stravaLocked: false,
  },
  {
    key: 'stretching',
    label: 'STRETCHING',
    icon: 'body',
    categories: ['stretching', 'mobility', 'ankle_mobility'],
    color: colors.purple,
    stravaLocked: false,
  },
  {
    key: 'supplements',
    label: 'SUPPLEMENTS',
    icon: 'medical',
    categories: ['supplement', 'medication', 'nutrition'],
    color: colors.crossTraining,
    stravaLocked: false,
  },
]

export default function TodayScreen() {
  const [tasks, setTasks] = useState([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [dayInfo, setDayInfo] = useState(null)
  const [review, setReview] = useState(null)
  const [reviewVisible, setReviewVisible] = useState(false)
  const [weekReview, setWeekReview] = useState(null)
  const [weekReviewVisible, setWeekReviewVisible] = useState(false)
  const [weekAdjustInput, setWeekAdjustInput] = useState('')
  const [weekAdjusting, setWeekAdjusting] = useState(false)

  useEffect(() => {
    fetchTodayPlan()
    fetchLatestReview()
    fetchWeekReview()

    const taskSubscription = supabase
      .channel('tasks-changes')
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'tasks' },
        (payload) => {
          setTasks(prev => prev.map(t =>
            t.id === payload.new.id ? { ...t, ...payload.new } : t
          ))
        }
      )
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'tasks' },
        () => { fetchTodayPlan() }
      )
      .subscribe()

    const planSubscription = supabase
      .channel('plans-changes')
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'plans' },
        () => { fetchTodayPlan() }
      )
      .subscribe()

    return () => {
      taskSubscription.unsubscribe()
      planSubscription.unsubscribe()
    }
  }, [])

  async function fetchTodayPlan() {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return

      const today = new Date().toISOString().split('T')[0]

      // First check if an active plan exists at all
      const { data: activePlans } = await supabase
        .from('plans')
        .select('*, plan_phases(*)')
        .eq('user_id', session.user.id)
        .eq('active', true)
        .limit(1)

      if (!activePlans || activePlans.length === 0) {
        setDayInfo(null)
        setTasks([])
        return
      }

      // Try to find today's plan day
      const { data: planDays } = await supabase
        .from('plan_days')
        .select(`*, tasks (*), plan_phases (name, phase_type)`)
        .eq('plan_id', activePlans[0].id)
        .eq('date', today)

      if (planDays && planDays.length > 0) {
        const allTasks = planDays.flatMap(pd => pd.tasks || [])
        const withTasks = planDays.find(pd => pd.tasks && pd.tasks.length > 0)
        const planDay = withTasks || planDays[0]
        setDayInfo(planDay)
        setTasks(allTasks)
      } else {
        // Plan exists but no plan_day for today — show plan name with no tasks
        const plan = activePlans[0]
        const currentPhase = plan.plan_phases?.find(p =>
          p.start_date <= today && p.end_date >= today
        )
        setDayInfo({ plan_phases: currentPhase || null, notes: null })
        setTasks([])
      }
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  async function fetchLatestReview() {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return

      const { data } = await supabase
        .from('daily_checkins')
        .select('*')
        .eq('user_id', session.user.id)
        .lte('date', new Date().toISOString().split('T')[0])
        .order('date', { ascending: false })

      if (data && data.length > 0) {
        const latest = data.find(d => !d.responses?.isWeekReview)
        if (!latest) return
        const reviewDate = new Date(latest.date)
        const todayMidnight = new Date()
        todayMidnight.setHours(0, 0, 0, 0)
        const diffDays = Math.floor((todayMidnight - reviewDate) / (1000 * 60 * 60 * 24))
        if (diffDays <= 1) {
          setReview(latest)
        }
      }
    } catch (err) {
      console.error('Review fetch error:', err)
    }
  }

  async function fetchWeekReview() {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return

      const today = new Date()
      const weekAgo = new Date(today)
      weekAgo.setDate(today.getDate() - 1)
      const weekAhead = new Date(today)
      weekAhead.setDate(today.getDate() + 7)

      const { data } = await supabase
        .from('daily_checkins')
        .select('*')
        .eq('user_id', session.user.id)
        .gte('date', weekAgo.toISOString().split('T')[0])
        .lte('date', weekAhead.toISOString().split('T')[0])
        .order('date', { ascending: false })

      const weekReviewEntry = data?.find(d => d.responses?.isWeekReview === true)
      if (weekReviewEntry && !weekReviewEntry.responses?.confirmed) {
        setWeekReview(weekReviewEntry)
      }
    } catch (err) {
      console.error('Week review fetch error:', err)
    }
  }

  async function adjustWeekPlan() {
    if (!weekAdjustInput.trim() || !weekReview) return
    setWeekAdjusting(true)

    try {
      const { data: { session } } = await supabase.auth.getSession()
      const { data: planData } = await supabase
        .from('plans')
        .select('name, goal_mileage, ai_context')
        .eq('user_id', session.user.id)
        .eq('active', true)
        .single()

      const { data, error } = await supabase.functions.invoke('adjust-week-plan', {
        body: JSON.stringify({
          userId: session.user.id,
          currentProposal: weekReview.responses.weekProposal,
          currentGoals: weekReview.responses.nextWeekGoals,
          userMessage: weekAdjustInput,
          planContext: planData,
        }),
        headers: { 'Content-Type': 'application/json' },
      })

      if (!error && data) {
        setWeekReview(prev => ({
          ...prev,
          responses: {
            ...prev.responses,
            weekProposal: data.weekProposal,
            nextWeekGoals: data.nextWeekGoals,
          }
        }))
        setWeekAdjustInput('')
      }
    } catch (err) {
      console.error('Adjust error:', err)
    } finally {
      setWeekAdjusting(false)
    }
  }

  async function confirmWeekPlan() {
    if (!weekReview) return
    try {
      const { data: { session } } = await supabase.auth.getSession()

      const newContext = `Next week goals: ${weekReview.responses.nextWeekGoals?.join(', ')}. ${weekReview.responses.weekProposal}`

      await Promise.all([
        supabase.from('daily_checkins').update({
          responses: { ...weekReview.responses, confirmed: true }
        }).eq('id', weekReview.id),
        supabase.from('plans')
          .update({ ai_context: newContext })
          .eq('user_id', session.user.id)
          .eq('active', true),
      ])

      setWeekReview(null)
      setWeekReviewVisible(false)
    } catch (err) {
      console.error('Confirm error:', err)
    }
  }

  async function onRefresh() {
    setRefreshing(true)
    await Promise.all([fetchTodayPlan(), fetchLatestReview(), fetchWeekReview()])
  }

  async function toggleTask(taskId, currentState, category) {
    if (STRAVA_CATEGORIES.includes(category)) return

    setTasks(prev => prev.map(t =>
      t.id === taskId ? { ...t, completed: !currentState } : t
    ))

    const { error } = await supabase
      .from('tasks')
      .update({
        completed: !currentState,
        completed_at: !currentState ? new Date().toISOString() : null
      })
      .eq('id', taskId)

    if (error) {
      setTasks(prev => prev.map(t =>
        t.id === taskId ? { ...t, completed: currentState } : t
      ))
    }
  }

  const completedCount = tasks.filter(t => t.completed).length
  const totalCount = tasks.length
  const progress = totalCount > 0 ? completedCount / totalCount : 0

  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric'
  })

  function getTasksForSection(section) {
    return tasks.filter(t => section.categories.includes(t.category))
  }

  function getCategoryIcon(category) {
    switch (category) {
      case 'run':
      case 'long_run':
      case 'running': return 'fitness'
      case 'cross_training':
      case 'bike': return 'bicycle'
      case 'elliptical': return 'pulse'
      case 'swim': return 'water'
      case 'strength':
      case 'isometric':
      case 'pt': return 'barbell'
      case 'stretching':
      case 'mobility':
      case 'ankle_mobility': return 'body'
      case 'supplement':
      case 'medication': return 'medical'
      case 'nutrition': return 'nutrition'
      default: return 'checkmark'
    }
  }

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    )
  }

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.container}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
          />
        }
      >
        {/* Dark Header */}
        <View style={styles.darkHeader}>
          <Text style={styles.dateText}>{today.toUpperCase()}</Text>
          <Text style={styles.phaseText}>
            {dayInfo?.plan_phases?.name?.toUpperCase() || 'NO ACTIVE PLAN'}
          </Text>

          {/* Progress Ring Area */}
          <View style={styles.progressRow}>
            <View style={styles.progressCircle}>
              <Text style={styles.progressNumber}>{Math.round(progress * 100)}</Text>
              <Text style={styles.progressPct}>%</Text>
            </View>
            <View style={styles.progressInfo}>
              <Text style={styles.progressLabel}>
                {completedCount}/{totalCount} TASKS COMPLETE
              </Text>
              <View style={styles.progressBarBg}>
                <View style={[styles.progressBarFill, { width: `${progress * 100}%` }]} />
              </View>
            </View>
          </View>
        </View>

        {/* Week Review Card */}
        {weekReview && (
          <TouchableOpacity
            style={styles.weekReviewCard}
            onPress={() => setWeekReviewVisible(true)}
            activeOpacity={0.8}
          >
            <View style={styles.reviewCardLeft}>
              <View style={[styles.reviewIconBox, { backgroundColor: 'rgba(255,255,255,0.2)' }]}>
                <Ionicons name="calendar" size={16} color={colors.white} />
              </View>
              <View style={styles.reviewCardTextWrap}>
                <Text style={[styles.reviewCardLabel, { color: 'rgba(255,255,255,0.7)' }]}>WEEK REVIEW — ACTION NEEDED</Text>
                <Text style={[styles.reviewCardSummary, { color: colors.white }]} numberOfLines={1}>
                  {weekReview.responses?.weekProposal}
                </Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.white} />
          </TouchableOpacity>
        )}

        {/* Yesterday's Review Card */}
        {review && (
          <TouchableOpacity
            style={styles.reviewCard}
            onPress={() => setReviewVisible(true)}
            activeOpacity={0.8}
          >
            <View style={styles.reviewCardLeft}>
              <View style={styles.reviewIconBox}>
                <Ionicons name="flash" size={16} color={colors.darkHeader} />
              </View>
              <View style={styles.reviewCardTextWrap}>
                <Text style={styles.reviewCardLabel}>
                  {new Date(review.date).toLocaleDateString('en-US', { weekday: 'long' }).toUpperCase()} REVIEW
                </Text>
                <Text style={styles.reviewCardSummary} numberOfLines={1}>
                  {review.responses?.summary}
                </Text>
              </View>
            </View>
            <View style={styles.reviewScoreBadge}>
              <Text style={styles.reviewScoreNum}>{review.responses?.score}</Text>
              <Text style={styles.reviewScoreDenom}>/10</Text>
            </View>
          </TouchableOpacity>
        )}

        {/* AI Insight Card */}
        {dayInfo?.notes && (
          <View style={styles.insightCard}>
            <View style={styles.insightIconBox}>
              <Ionicons name="flash" size={16} color={colors.darkHeader} />
            </View>
            <Text style={styles.insightText}>{dayInfo.notes}</Text>
          </View>
        )}

        {/* No plan state */}
        {!dayInfo && !loading && tasks.length === 0 && (
          <View style={styles.section}>
            <View style={styles.emptyCard}>
              <Ionicons name="flash-outline" size={40} color={colors.textLight} />
              <Text style={styles.emptyTitle}>NO PLAN YET</Text>
              <Text style={styles.emptySubtitle}>
                Create a plan and Claude will generate your daily tasks
              </Text>
              <TouchableOpacity
                style={styles.createPlanButton}
                onPress={() => router.push('/onboarding')}
              >
                <Text style={styles.createPlanText}>CREATE MY PLAN</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Task Sections */}
        {SECTIONS.map(section => {
          const sectionTasks = getTasksForSection(section)
          if (sectionTasks.length === 0) return null

          const sectionCompleted = sectionTasks.filter(t => t.completed).length

          return (
            <View key={section.key} style={styles.section}>
              {/* Section Header */}
              <View style={styles.sectionHeader}>
                <View style={styles.sectionTitleRow}>
                  <View style={[styles.sectionIconBox, { backgroundColor: section.color }]}>
                    <Ionicons name={section.icon} size={12} color={colors.white} />
                  </View>
                  <Text style={styles.sectionTitle}>{section.label}</Text>
                </View>
                <Text style={styles.sectionCount}>
                  {sectionCompleted}/{sectionTasks.length}
                </Text>
              </View>

              {/* Strava notice */}
              {section.stravaLocked && (
                <View style={styles.stravaNotice}>
                  <Ionicons name="flash" size={12} color="#E65100" />
                  <Text style={styles.stravaNoticeText}>
                    AUTO-COMPLETES WHEN STRAVA SYNCS
                  </Text>
                </View>
              )}

              {/* Tasks */}
              {sectionTasks.map(task => {
                const isLocked = STRAVA_CATEGORIES.includes(task.category)

                return (
                  <TouchableOpacity
                    key={task.id}
                    style={[
                      styles.taskCard,
                      task.completed && styles.taskCompleted,
                      isLocked && styles.taskLocked,
                    ]}
                    onPress={() => toggleTask(task.id, task.completed, task.category)}
                    activeOpacity={isLocked ? 1 : 0.7}
                  >
                    {/* Checkbox */}
                    <View style={[
                      styles.checkbox,
                      task.completed && { backgroundColor: section.color, borderColor: section.color },
                      isLocked && !task.completed && styles.checkboxLocked,
                    ]}>
                      {task.completed ? (
                        <Ionicons name="checkmark" size={14} color={colors.white} />
                      ) : isLocked ? (
                        <Ionicons name="lock-closed" size={11} color="#E65100" />
                      ) : null}
                    </View>

                    {/* Task Info */}
                    <View style={styles.taskInfo}>
                      <Text style={[
                        styles.taskTitle,
                        task.completed && styles.taskTitleDone
                      ]}>
                        {task.title}
                      </Text>
                      {task.target_value && (
                        <Text style={styles.taskTarget}>{task.target_value}</Text>
                      )}
                      {isLocked && !task.completed && (
                        <Text style={styles.lockedHint}>COMPLETE VIA STRAVA</Text>
                      )}
                    </View>

                    {/* Category Badge */}
                    <View style={[styles.categoryBadge, { backgroundColor: section.color }]}>
                      <Ionicons
                        name={getCategoryIcon(task.category)}
                        size={14}
                        color={colors.white}
                      />
                    </View>
                  </TouchableOpacity>
                )
              })}
            </View>
          )
        })}

        {/* Rest day */}
        {dayInfo && tasks.length === 0 && (
          <View style={styles.section}>
            <View style={styles.emptyCard}>
              <Ionicons name="moon-outline" size={40} color={colors.textLight} />
              <Text style={styles.emptyTitle}>REST DAY</Text>
              <Text style={styles.emptySubtitle}>
                Recovery is part of training. Take it easy today.
              </Text>
            </View>
          </View>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* Week Review Modal */}
      <Modal
        visible={weekReviewVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setWeekReviewVisible(false)}
      >
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={styles.modalContainer}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalHeaderLabel}>WEEK REVIEW</Text>
                <Text style={styles.modalHeaderDate}>
                  {weekReview && new Date(weekReview.date).toLocaleDateString('en-US', {
                    month: 'long', day: 'numeric'
                  }).toUpperCase()}
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => setWeekReviewVisible(false)}
                style={styles.modalCloseBtn}
              >
                <Ionicons name="close" size={22} color={colors.white} />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalScroll} showsVerticalScrollIndicator={false}>

              {/* Week Stats */}
              <View style={styles.weekStatsRow}>
                <View style={styles.weekStatBox}>
                  <Text style={styles.weekStatValue}>{weekReview?.responses?.weekStats?.totalMilesRun}</Text>
                  <Text style={styles.weekStatLabel}>MILES</Text>
                </View>
                <View style={styles.weekStatDivider} />
                <View style={styles.weekStatBox}>
                  <Text style={styles.weekStatValue}>{weekReview?.responses?.weekStats?.completionRate}</Text>
                  <Text style={styles.weekStatLabel}>COMPLETED</Text>
                </View>
                <View style={styles.weekStatDivider} />
                <View style={styles.weekStatBox}>
                  <Text style={styles.weekStatValue}>{weekReview?.responses?.weekStats?.activeDays}</Text>
                  <Text style={styles.weekStatLabel}>ACTIVE DAYS</Text>
                </View>
              </View>

              {/* Week Summary */}
              <View style={styles.modalSection}>
                <View style={styles.modalSectionHeader}>
                  <Ionicons name="document-text" size={14} color={colors.primary} />
                  <Text style={styles.modalSectionTitle}>THIS WEEK</Text>
                </View>
                <Text style={styles.modalBodyText}>{weekReview?.responses?.weekSummary}</Text>
              </View>

              {/* Next Week Proposal */}
              <View style={[styles.modalSection, styles.modalCoachSection]}>
                <View style={styles.modalSectionHeader}>
                  <Ionicons name="flash" size={14} color={colors.primary} />
                  <Text style={styles.modalSectionTitle}>NEXT WEEK PROPOSAL</Text>
                </View>
                <Text style={styles.modalBodyText}>{weekReview?.responses?.weekProposal}</Text>
                {weekReview?.responses?.nextWeekGoals?.map((goal, i) => (
                  <View key={i} style={styles.modalListItem}>
                    <Ionicons name="checkmark-circle-outline" size={14} color={colors.primary} />
                    <Text style={styles.modalListText}>{goal}</Text>
                  </View>
                ))}
              </View>

              {/* Adjust Input */}
              <View style={styles.modalSection}>
                <View style={styles.modalSectionHeader}>
                  <Ionicons name="chatbubble-ellipses" size={14} color={colors.textSecondary} />
                  <Text style={[styles.modalSectionTitle, { color: colors.textSecondary }]}>WANT TO ADJUST?</Text>
                </View>
                <TextInput
                  style={styles.adjustInput}
                  placeholder='e.g. "Focus more on speed work" or "My knee is bothering me"'
                  placeholderTextColor={colors.textLight}
                  value={weekAdjustInput}
                  onChangeText={setWeekAdjustInput}
                  multiline
                />
                <TouchableOpacity
                  style={[styles.adjustBtn, (!weekAdjustInput.trim() || weekAdjusting) && { opacity: 0.5 }]}
                  onPress={adjustWeekPlan}
                  disabled={!weekAdjustInput.trim() || weekAdjusting}
                >
                  {weekAdjusting ? (
                    <ActivityIndicator size="small" color={colors.darkHeader} />
                  ) : (
                    <Text style={styles.adjustBtnText}>ADJUST PLAN</Text>
                  )}
                </TouchableOpacity>
              </View>

              <View style={{ height: 16 }} />
            </ScrollView>

            {/* Confirm Button */}
            <View style={styles.weekConfirmRow}>
              <TouchableOpacity style={styles.weekConfirmBtn} onPress={confirmWeekPlan}>
                <Text style={styles.weekConfirmText}>CONFIRM NEXT WEEK</Text>
                <Ionicons name="checkmark" size={18} color={colors.darkHeader} />
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Day Review Modal */}
      <Modal
        visible={reviewVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setReviewVisible(false)}
      >
        <View style={styles.modalContainer}>
          {/* Modal Header */}
          <View style={styles.modalHeader}>
            <View>
              <Text style={styles.modalHeaderLabel}>DAY REVIEW</Text>
              <Text style={styles.modalHeaderDate}>
                {review && new Date(review.date).toLocaleDateString('en-US', {
                  weekday: 'long', month: 'long', day: 'numeric'
                }).toUpperCase()}
              </Text>
            </View>
            <TouchableOpacity
              onPress={() => setReviewVisible(false)}
              style={styles.modalCloseBtn}
            >
              <Ionicons name="close" size={22} color={colors.white} />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.modalScroll} showsVerticalScrollIndicator={false}>

            {/* Score */}
            <View style={styles.modalScoreRow}>
              <View style={styles.modalScoreCircle}>
                <Text style={styles.modalScoreNumber}>{review?.responses?.score}</Text>
                <Text style={styles.modalScoreDenom}>/10</Text>
              </View>
              <View style={styles.modalScoreInfo}>
                <Text style={styles.modalScoreLabel}>DAILY SCORE</Text>
                <View style={styles.modalScoreBarBg}>
                  <View style={[
                    styles.modalScoreBarFill,
                    { width: `${((review?.responses?.score ?? 0) / 10) * 100}%` }
                  ]} />
                </View>
              </View>
            </View>

            {/* Summary */}
            <View style={styles.modalSection}>
              <View style={styles.modalSectionHeader}>
                <Ionicons name="document-text" size={14} color={colors.primary} />
                <Text style={styles.modalSectionTitle}>SUMMARY</Text>
              </View>
              <Text style={styles.modalBodyText}>{review?.responses?.summary}</Text>
            </View>

            {/* Strava Insight */}
            {review?.responses?.stravaInsight && (
              <View style={[styles.modalSection, styles.modalStravaSection]}>
                <View style={styles.modalSectionHeader}>
                  <Ionicons name="flash" size={14} color="#FC4C02" />
                  <Text style={[styles.modalSectionTitle, { color: '#FC4C02' }]}>STRAVA INSIGHT</Text>
                </View>
                <Text style={styles.modalBodyText}>{review.responses.stravaInsight}</Text>
              </View>
            )}

            {/* Completed Items */}
            {review?.responses?.completedItems?.length > 0 && (
              <View style={styles.modalSection}>
                <View style={styles.modalSectionHeader}>
                  <Ionicons name="checkmark-circle" size={14} color={colors.run} />
                  <Text style={[styles.modalSectionTitle, { color: colors.run }]}>COMPLETED</Text>
                </View>
                {review.responses.completedItems.map((item, i) => (
                  <View key={i} style={styles.modalListItem}>
                    <Ionicons name="checkmark" size={14} color={colors.run} />
                    <Text style={styles.modalListText}>{item}</Text>
                  </View>
                ))}
              </View>
            )}

            {/* Missed Items */}
            {review?.responses?.missedItems?.length > 0 && (
              <View style={styles.modalSection}>
                <View style={styles.modalSectionHeader}>
                  <Ionicons name="close-circle" size={14} color={colors.danger} />
                  <Text style={[styles.modalSectionTitle, { color: colors.danger }]}>MISSED</Text>
                </View>
                {review.responses.missedItems.map((item, i) => (
                  <View key={i} style={styles.modalListItem}>
                    <Ionicons name="remove" size={14} color={colors.danger} />
                    <Text style={styles.modalListText}>{item}</Text>
                  </View>
                ))}
              </View>
            )}

            {/* AI Coaching Note */}
            {review?.ai_followup && review.ai_followup !== review?.responses?.summary && (
              <View style={[styles.modalSection, styles.modalCoachSection]}>
                <View style={styles.modalSectionHeader}>
                  <Ionicons name="chatbubble-ellipses" size={14} color={colors.primary} />
                  <Text style={styles.modalSectionTitle}>COACH NOTE</Text>
                </View>
                <Text style={styles.modalBodyText}>{review.ai_followup}</Text>
              </View>
            )}

            <View style={{ height: 40 }} />
          </ScrollView>
        </View>
      </Modal>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
  },

  // Header
  darkHeader: {
    backgroundColor: colors.darkHeader,
    padding: 24,
    paddingTop: 16,
    paddingBottom: 28,
  },
  dateText: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.textOnDarkSecondary,
    letterSpacing: 2,
    marginBottom: 4,
  },
  phaseText: {
    fontSize: 22,
    fontWeight: '900',
    color: colors.white,
    letterSpacing: 1,
    marginBottom: 20,
  },
  progressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  progressCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 3,
    borderColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
  },
  progressNumber: {
    fontSize: 24,
    fontWeight: '900',
    color: colors.white,
  },
  progressPct: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.primary,
    marginTop: 4,
  },
  progressInfo: {
    flex: 1,
    gap: 8,
  },
  progressLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.textOnDarkSecondary,
    letterSpacing: 1,
  },
  progressBarBg: {
    height: 4,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 2,
  },
  progressBarFill: {
    height: 4,
    backgroundColor: colors.primary,
    borderRadius: 2,
  },
  notesText: {
    fontSize: 12,
    color: colors.textOnDarkSecondary,
    lineHeight: 16,
  },

  // AI Insight Card
  insightCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: colors.primary,
    marginHorizontal: 16,
    marginTop: 16,
    borderRadius: 14,
    padding: 14,
    gap: 12,
  },
  insightIconBox: {
    width: 30,
    height: 30,
    borderRadius: 8,
    backgroundColor: 'rgba(0,0,0,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  insightText: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    color: colors.darkHeader,
    lineHeight: 20,
  },

  // Week Review Card
  weekReviewCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.darkHeader,
    marginHorizontal: 16,
    marginTop: 16,
    borderRadius: 14,
    padding: 14,
    gap: 12,
    borderWidth: 1,
    borderColor: colors.primary,
  },

  // Week Modal Stats
  weekStatsRow: {
    flexDirection: 'row',
    backgroundColor: colors.darkHeader,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingVertical: 24,
    paddingHorizontal: 16,
  },
  weekStatBox: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
  },
  weekStatDivider: {
    width: 1,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  weekStatValue: {
    fontSize: 24,
    fontWeight: '900',
    color: colors.white,
  },
  weekStatLabel: {
    fontSize: 9,
    fontWeight: '800',
    color: colors.textOnDarkSecondary,
    letterSpacing: 1.5,
  },

  // Adjust input
  adjustInput: {
    backgroundColor: colors.background,
    borderRadius: 10,
    padding: 12,
    fontSize: 14,
    color: colors.textPrimary,
    minHeight: 72,
    textAlignVertical: 'top',
  },
  adjustBtn: {
    backgroundColor: colors.darkHeader,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 8,
  },
  adjustBtnText: {
    color: colors.white,
    fontWeight: '900',
    fontSize: 12,
    letterSpacing: 1.5,
  },

  // Confirm row
  weekConfirmRow: {
    padding: 16,
    paddingBottom: 32,
    backgroundColor: colors.background,
  },
  weekConfirmBtn: {
    backgroundColor: colors.primary,
    borderRadius: 14,
    paddingVertical: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  weekConfirmText: {
    color: colors.darkHeader,
    fontWeight: '900',
    fontSize: 14,
    letterSpacing: 1.5,
  },

  // Review Card
  reviewCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.primary,
    marginHorizontal: 16,
    marginTop: 16,
    borderRadius: 14,
    padding: 14,
    gap: 12,
  },
  reviewCardLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  reviewIconBox: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: 'rgba(0,0,0,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  reviewCardTextWrap: {
    flex: 1,
  },
  reviewCardLabel: {
    fontSize: 10,
    fontWeight: '900',
    color: colors.darkHeader,
    letterSpacing: 1.5,
    marginBottom: 2,
  },
  reviewCardSummary: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.darkHeader,
  },
  reviewScoreBadge: {
    flexDirection: 'row',
    alignItems: 'baseline',
    backgroundColor: 'rgba(0,0,0,0.12)',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  reviewScoreNum: {
    fontSize: 20,
    fontWeight: '900',
    color: colors.darkHeader,
  },
  reviewScoreDenom: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.darkHeader,
  },

  // Sections
  section: {
    padding: 16,
    paddingBottom: 4,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  sectionIconBox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '900',
    color: colors.textPrimary,
    letterSpacing: 1.5,
  },
  sectionCount: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textSecondary,
  },
  stravaNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FFF3E0',
    borderRadius: 8,
    padding: 8,
    marginBottom: 8,
    borderLeftWidth: 3,
    borderLeftColor: '#FC4C02',
  },
  stravaNoticeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#E65100',
    letterSpacing: 0.5,
  },

  // Tasks
  taskCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.white,
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
    gap: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
  },
  taskCompleted: {
    opacity: 0.5,
  },
  taskLocked: {
    backgroundColor: '#FAFAFA',
    borderWidth: 1,
    borderColor: colors.border,
  },
  checkbox: {
    width: 26,
    height: 26,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxLocked: {
    borderColor: '#FC4C02',
    backgroundColor: '#FFF3E0',
  },
  taskInfo: {
    flex: 1,
  },
  taskTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  taskTitleDone: {
    textDecorationLine: 'line-through',
    color: colors.textSecondary,
  },
  taskTarget: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 2,
    fontWeight: '500',
  },
  lockedHint: {
    fontSize: 10,
    fontWeight: '800',
    color: '#FC4C02',
    marginTop: 3,
    letterSpacing: 0.5,
  },
  categoryBadge: {
    width: 30,
    height: 30,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Empty states
  emptyCard: {
    backgroundColor: colors.white,
    borderRadius: 16,
    padding: 32,
    alignItems: 'center',
    gap: 10,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: colors.textPrimary,
    letterSpacing: 2,
  },
  emptySubtitle: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
  },
  createPlanButton: {
    backgroundColor: colors.darkHeader,
    borderRadius: 10,
    paddingHorizontal: 24,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 8,
  },
  createPlanText: {
    color: colors.white,
    fontWeight: '900',
    fontSize: 13,
    letterSpacing: 2,
  },

  // Modal
  modalContainer: {
    flex: 1,
    backgroundColor: colors.darkHeader,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    padding: 24,
    paddingTop: 20,
    paddingBottom: 20,
  },
  modalHeaderLabel: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.textOnDarkSecondary,
    letterSpacing: 2,
    marginBottom: 4,
  },
  modalHeaderDate: {
    fontSize: 18,
    fontWeight: '900',
    color: colors.white,
    letterSpacing: 0.5,
  },
  modalCloseBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalScroll: {
    flex: 1,
    backgroundColor: colors.background,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },
  modalScoreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    padding: 20,
    backgroundColor: colors.darkHeader,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: 24,
  },
  modalScoreCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 3,
    borderColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
  },
  modalScoreNumber: {
    fontSize: 28,
    fontWeight: '900',
    color: colors.white,
  },
  modalScoreDenom: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.primary,
    marginTop: 6,
  },
  modalScoreInfo: {
    flex: 1,
    gap: 10,
  },
  modalScoreLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.textOnDarkSecondary,
    letterSpacing: 1.5,
  },
  modalScoreBarBg: {
    height: 6,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 3,
  },
  modalScoreBarFill: {
    height: 6,
    backgroundColor: colors.primary,
    borderRadius: 3,
  },
  modalSection: {
    backgroundColor: colors.white,
    borderRadius: 14,
    padding: 16,
    margin: 16,
    marginBottom: 0,
    gap: 10,
  },
  modalStravaSection: {
    borderLeftWidth: 3,
    borderLeftColor: '#FC4C02',
  },
  modalCoachSection: {
    borderLeftWidth: 3,
    borderLeftColor: colors.primary,
  },
  modalSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  modalSectionTitle: {
    fontSize: 11,
    fontWeight: '900',
    color: colors.textPrimary,
    letterSpacing: 1.5,
  },
  modalBodyText: {
    fontSize: 15,
    color: colors.textPrimary,
    lineHeight: 22,
  },
  modalListItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 4,
  },
  modalListText: {
    fontSize: 14,
    color: colors.textPrimary,
    flex: 1,
  },
  modalEmptyText: {
    fontSize: 14,
    color: colors.textLight,
    fontStyle: 'italic',
  },
})
