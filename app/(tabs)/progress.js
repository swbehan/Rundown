import { useState, useEffect } from 'react'
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { supabase } from '../../lib/supabase'
import colors from '../../constants/colors'

const SECTION_CONFIG = {
  cardio: { label: 'CARDIO', icon: 'fitness', color: colors.run, categories: ['run', 'long_run', 'running', 'cross_training', 'bike', 'elliptical', 'swim'] },
  strength: { label: 'STRENGTH', icon: 'barbell', color: colors.pt, categories: ['strength', 'pt', 'isometric'] },
  stretching: { label: 'STRETCHING', icon: 'body', color: colors.purple, categories: ['stretching', 'mobility', 'ankle_mobility'] },
  supplements: { label: 'SUPPLEMENTS', icon: 'medical', color: colors.crossTraining, categories: ['supplement', 'medication', 'nutrition'] },
}

export default function ProgressScreen() {
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [weekDays, setWeekDays] = useState([])
  const [sectionStats, setSectionStats] = useState([])
  const [recentActivities, setRecentActivities] = useState([])
  const [streak, setStreak] = useState(0)
  const [weekSummary, setWeekSummary] = useState({ completed: 0, total: 0 })

  useEffect(() => {
    fetchProgress()
  }, [])

  async function fetchProgress() {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return

      const userId = session.user.id
      const today = new Date()

      // Get start of current week (Monday)
      const weekStart = new Date(today)
      const day = weekStart.getDay()
      const diff = day === 0 ? -6 : 1 - day
      weekStart.setDate(weekStart.getDate() + diff)
      weekStart.setHours(0, 0, 0, 0)

      const weekEnd = new Date(weekStart)
      weekEnd.setDate(weekEnd.getDate() + 6)

      // Fetch this week's plan days with tasks
      const { data: planDays } = await supabase
        .from('plan_days')
        .select('*, tasks(*)')
        .gte('date', weekStart.toISOString().split('T')[0])
        .lte('date', weekEnd.toISOString().split('T')[0])
        .order('date', { ascending: true })

      // Build 7 day strip
      const days = []
      for (let i = 0; i < 7; i++) {
        const date = new Date(weekStart)
        date.setDate(date.getDate() + i)
        const dateStr = date.toISOString().split('T')[0]
        const dayName = date.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase()
        const isToday = dateStr === today.toISOString().split('T')[0]
        const isFuture = date > today

        const dayPlans = planDays?.filter(pd => pd.date === dateStr) || []
        const allTasks = dayPlans.flatMap(pd => pd.tasks || [])
        const total = allTasks.length
        const completed = allTasks.filter(t => t.completed).length
        const pct = total > 0 ? Math.round((completed / total) * 100) : null

        days.push({ dateStr, dayName, total, completed, pct, isToday, isFuture })
      }
      setWeekDays(days)

      // Week summary
      const totalTasks = days.reduce((sum, d) => sum + d.total, 0)
      const completedTasks = days.reduce((sum, d) => sum + d.completed, 0)
      setWeekSummary({ completed: completedTasks, total: totalTasks })

      // Calculate streak (last 30 days)
      const thirtyDaysAgo = new Date(today)
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

      const { data: allPlanDays } = await supabase
        .from('plan_days')
        .select('*, tasks(*)')
        .gte('date', thirtyDaysAgo.toISOString().split('T')[0])
        .lte('date', today.toISOString().split('T')[0])
        .order('date', { ascending: false })

      let currentStreak = 0
      for (const pd of allPlanDays || []) {
        const tasks = pd.tasks || []
        if (tasks.length === 0) continue
        const pct = tasks.filter(t => t.completed).length / tasks.length
        if (pct >= 0.5) currentStreak++
        else break
      }
      setStreak(currentStreak)

      // Section breakdown — only show sections that have tasks this week
      const allWeekTasks = planDays?.flatMap(pd => pd.tasks || []) || []
      const sections = []

      for (const [key, config] of Object.entries(SECTION_CONFIG)) {
        const sectionTasks = allWeekTasks.filter(t =>
          config.categories.includes(t.category)
        )
        if (sectionTasks.length === 0) continue

        const completed = sectionTasks.filter(t => t.completed).length
        sections.push({
          key,
          label: config.label,
          icon: config.icon,
          color: config.color,
          completed,
          total: sectionTasks.length,
          pct: Math.round((completed / sectionTasks.length) * 100),
        })
      }
      setSectionStats(sections)

      // Recent Strava activities
      const sevenDaysAgo = new Date(today)
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)

      const { data: activities } = await supabase
        .from('strava_activities')
        .select('*')
        .eq('user_id', userId)
        .gte('start_date', sevenDaysAgo.toISOString())
        .order('start_date', { ascending: false })

      setRecentActivities(activities || [])

    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  async function onRefresh() {
    setRefreshing(true)
    await fetchProgress()
  }

  function formatPace(secondsPerKm) {
    if (!secondsPerKm) return '--'
    const secPerMile = secondsPerKm * 1.609
    const mins = Math.floor(secPerMile / 60)
    const secs = Math.round(secPerMile % 60)
    return `${mins}:${secs.toString().padStart(2, '0')}/mi`
  }

  function formatDistance(meters) {
    if (!meters) return '0 mi'
    return `${(meters / 1609).toFixed(1)} mi`
  }

  function formatDuration(seconds) {
    if (!seconds) return '--'
    const mins = Math.floor(seconds / 60)
    if (mins < 60) return `${mins}m`
    const hrs = Math.floor(mins / 60)
    const remMins = mins % 60
    return `${hrs}h ${remMins}m`
  }

  function getActivityIcon(type) {
    switch (type) {
      case 'Run':
      case 'VirtualRun': return 'fitness'
      case 'Ride':
      case 'VirtualRide': return 'bicycle'
      case 'Swim': return 'water'
      case 'Walk': return 'walk'
      default: return 'pulse'
    }
  }

  function getActivityColor(type) {
    switch (type) {
      case 'Run':
      case 'VirtualRun': return colors.run
      case 'Ride':
      case 'VirtualRide': return colors.crossTraining
      case 'Swim': return '#0099CC'
      default: return colors.primary
    }
  }

  function getDayColor(day) {
    if (day.isFuture) return colors.border
    if (day.pct === null) return colors.border
    if (day.pct >= 80) return colors.run
    if (day.pct >= 50) return colors.warning
    return colors.danger
  }

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    )
  }

  return (
    <ScrollView
      style={styles.container}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
      }
    >
      {/* Dark Header */}
      <View style={styles.darkHeader}>
        <Text style={styles.headerTitle}>PROGRESS</Text>
        <View style={styles.headerStats}>
          <View style={styles.headerStat}>
            <Text style={styles.headerStatValue}>{streak}</Text>
            <Text style={styles.headerStatLabel}>DAY STREAK</Text>
          </View>
          <View style={styles.headerStatDivider} />
          <View style={styles.headerStat}>
            <Text style={styles.headerStatValue}>
              {weekSummary.completed}/{weekSummary.total}
            </Text>
            <Text style={styles.headerStatLabel}>TASKS THIS WEEK</Text>
          </View>
          <View style={styles.headerStatDivider} />
          <View style={styles.headerStat}>
            <Text style={styles.headerStatValue}>
              {weekSummary.total > 0
                ? `${Math.round((weekSummary.completed / weekSummary.total) * 100)}%`
                : '--'
              }
            </Text>
            <Text style={styles.headerStatLabel}>COMPLETION</Text>
          </View>
        </View>
      </View>

      {/* This Week Strip */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>THIS WEEK</Text>
        <View style={styles.weekStrip}>
          {weekDays.map((day, i) => (
            <View key={i} style={styles.dayColumn}>
              <Text style={[
                styles.dayPct,
                { color: day.isToday ? colors.primary : colors.textSecondary }
              ]}>
                {day.isFuture || day.pct === null ? '' : `${day.pct}%`}
              </Text>
              <View style={[
                styles.dayBar,
                { backgroundColor: getDayColor(day) },
                day.isToday && styles.dayBarToday,
              ]}>
                {day.isToday && (
                  <View style={styles.todayDot} />
                )}
              </View>
              <Text style={[
                styles.dayName,
                day.isToday && { color: colors.primary, fontWeight: '900' }
              ]}>
                {day.dayName}
              </Text>
            </View>
          ))}
        </View>

        {/* Legend */}
        <View style={styles.legend}>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: colors.run }]} />
            <Text style={styles.legendText}>80%+</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: colors.warning }]} />
            <Text style={styles.legendText}>50%+</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: colors.danger }]} />
            <Text style={styles.legendText}>BELOW 50%</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: colors.border }]} />
            <Text style={styles.legendText}>NO DATA</Text>
          </View>
        </View>
      </View>

      {/* Section Breakdown */}
      {sectionStats.length > 0 && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>THIS WEEK BY SECTION</Text>
          <Text style={styles.cardSubtitle}>TASKS COMPLETED PER CATEGORY</Text>
          {sectionStats.map((section, i) => (
            <View
              key={section.key}
              style={[
                styles.sectionRow,
                i === sectionStats.length - 1 && { borderBottomWidth: 0 }
              ]}
            >
              <View style={[styles.sectionIcon, { backgroundColor: section.color }]}>
                <Ionicons name={section.icon} size={14} color={colors.white} />
              </View>
              <View style={styles.sectionInfo}>
                <View style={styles.sectionLabelRow}>
                  <Text style={styles.sectionLabel}>{section.label}</Text>
                  <Text style={styles.sectionFraction}>
                    {section.completed}/{section.total}
                  </Text>
                </View>
                <View style={styles.sectionBarBg}>
                  <View style={[
                    styles.sectionBarFill,
                    {
                      width: `${section.pct}%`,
                      backgroundColor: section.color,
                    }
                  ]} />
                </View>
              </View>
              <Text style={[styles.sectionPct, { color: section.color }]}>
                {section.pct}%
              </Text>
            </View>
          ))}
        </View>
      )}

      {/* Recent Activities */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>RECENT ACTIVITIES</Text>
        <Text style={styles.cardSubtitle}>FROM STRAVA</Text>

        {recentActivities.length === 0 ? (
          <View style={styles.emptyActivities}>
            <Ionicons name="fitness-outline" size={36} color={colors.textLight} />
            <Text style={styles.emptyText}>NO ACTIVITIES YET</Text>
            <Text style={styles.emptySubtext}>Go for a run and sync with Strava</Text>
          </View>
        ) : (
          recentActivities.map((activity, index) => (
            <View
              key={activity.id}
              style={[
                styles.activityRow,
                index === recentActivities.length - 1 && { borderBottomWidth: 0 }
              ]}
            >
              <View style={[
                styles.activityIcon,
                { backgroundColor: getActivityColor(activity.activity_type) }
              ]}>
                <Ionicons
                  name={getActivityIcon(activity.activity_type)}
                  size={18}
                  color={colors.white}
                />
              </View>
              <View style={styles.activityInfo}>
                <Text style={styles.activityName}>{activity.name}</Text>
                <Text style={styles.activityMeta}>
                  {formatDistance(activity.distance_meters)} · {formatDuration(activity.moving_time_seconds)} · {formatPace(activity.avg_pace_per_km)}
                </Text>
                <Text style={styles.activityDate}>
                  {new Date(activity.start_date).toLocaleDateString('en-US', {
                    weekday: 'short', month: 'short', day: 'numeric'
                  }).toUpperCase()}
                </Text>
              </View>
              {activity.avg_heartrate && (
                <View style={styles.hrBadge}>
                  <Text style={styles.hrValue}>{Math.round(activity.avg_heartrate)}</Text>
                  <Text style={styles.hrLabel}>BPM</Text>
                </View>
              )}
            </View>
          ))
        )}
      </View>

      <View style={{ height: 40 }} />
    </ScrollView>
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
  darkHeader: {
    backgroundColor: colors.darkHeader,
    padding: 24,
    paddingTop: 16,
    paddingBottom: 28,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: '900',
    color: colors.white,
    letterSpacing: 3,
    marginBottom: 20,
  },
  headerStats: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerStat: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
  },
  headerStatValue: {
    fontSize: 26,
    fontWeight: '900',
    color: colors.white,
  },
  headerStatLabel: {
    fontSize: 9,
    fontWeight: '700',
    color: colors.textOnDarkSecondary,
    letterSpacing: 1,
    textAlign: 'center',
  },
  headerStatDivider: {
    width: 1,
    height: 40,
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  card: {
    backgroundColor: colors.white,
    margin: 16,
    marginBottom: 4,
    borderRadius: 16,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
  },
  cardTitle: {
    fontSize: 13,
    fontWeight: '900',
    color: colors.textPrimary,
    letterSpacing: 2,
    marginBottom: 2,
  },
  cardSubtitle: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.textLight,
    letterSpacing: 1,
    marginBottom: 16,
  },
  weekStrip: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    marginBottom: 16,
    gap: 4,
  },
  dayColumn: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
  },
  dayPct: {
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.5,
    height: 14,
  },
  dayBar: {
    width: '100%',
    height: 60,
    borderRadius: 8,
    minWidth: 32,
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingBottom: 6,
  },
  dayBarToday: {
    borderWidth: 2,
    borderColor: colors.primary,
  },
  todayDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.primary,
  },
  dayName: {
    fontSize: 9,
    fontWeight: '700',
    color: colors.textSecondary,
    letterSpacing: 0.5,
  },
  legend: {
    flexDirection: 'row',
    gap: 12,
    flexWrap: 'wrap',
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendText: {
    fontSize: 9,
    fontWeight: '700',
    color: colors.textSecondary,
    letterSpacing: 0.5,
  },
  sectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    gap: 12,
  },
  sectionIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionInfo: {
    flex: 1,
    gap: 6,
  },
  sectionLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '900',
    color: colors.textPrimary,
    letterSpacing: 1,
  },
  sectionFraction: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textSecondary,
  },
  sectionBarBg: {
    height: 6,
    backgroundColor: colors.background,
    borderRadius: 3,
  },
  sectionBarFill: {
    height: 6,
    borderRadius: 3,
  },
  sectionPct: {
    fontSize: 16,
    fontWeight: '900',
    minWidth: 42,
    textAlign: 'right',
  },
  activityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    gap: 12,
  },
  activityIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  activityInfo: {
    flex: 1,
    gap: 2,
  },
  activityName: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  activityMeta: {
    fontSize: 12,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  activityDate: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.textLight,
    letterSpacing: 0.5,
  },
  hrBadge: {
    alignItems: 'center',
    backgroundColor: '#FFF0F0',
    borderRadius: 10,
    padding: 8,
    minWidth: 52,
  },
  hrValue: {
    fontSize: 16,
    fontWeight: '900',
    color: colors.danger,
  },
  hrLabel: {
    fontSize: 9,
    fontWeight: '800',
    color: colors.danger,
    letterSpacing: 1,
  },
  emptyActivities: {
    alignItems: 'center',
    padding: 24,
    gap: 8,
  },
  emptyText: {
    fontSize: 14,
    fontWeight: '900',
    color: colors.textSecondary,
    letterSpacing: 2,
  },
  emptySubtext: {
    fontSize: 12,
    color: colors.textLight,
    fontWeight: '500',
  },
})