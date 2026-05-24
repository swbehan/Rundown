import { useState, useEffect } from 'react'
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  Alert,
} from 'react-native'
import { supabase } from '../../lib/supabase'
import colors from '../../constants/colors'
import { router } from 'expo-router'

export default function PlanScreen() {
  const [plans, setPlans] = useState([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  useEffect(() => {
    fetchPlans()
  }, [])

  async function fetchPlans() {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return

      const { data, error } = await supabase
        .from('plans')
        .select(`
          *,
          plan_phases (*)
        `)
        .eq('user_id', session.user.id)
        .order('created_at', { ascending: false })

      if (error) throw error
      setPlans(data || [])
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  async function togglePlan(planId, currentActive) {
    try {
      const { error } = await supabase
        .from('plans')
        .update({ active: !currentActive })
        .eq('id', planId)

      if (error) throw error
      setPlans(prev => prev.map(p =>
        p.id === planId ? { ...p, active: !currentActive } : p
      ))
    } catch (err) {
      Alert.alert('Error', err.message)
    }
  }

  async function deletePlan(planId) {
    Alert.alert(
      'Delete Plan',
      'Are you sure? This will delete all tasks and progress for this plan.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            await supabase.from('plans').delete().eq('id', planId)
            setPlans(prev => prev.filter(p => p.id !== planId))
          }
        }
      ]
    )
  }

  function getPhaseForToday(phases) {
    if (!phases || phases.length === 0) return null
    const today = new Date().toISOString().split('T')[0]
    return phases.find(p => p.start_date <= today && p.end_date >= today)
  }

  function getProgressPercent(phases) {
    if (!phases || phases.length === 0) return 0
    const today = new Date()
    const sorted = [...phases].sort((a, b) =>
      new Date(a.start_date) - new Date(b.start_date)
    )
    const start = new Date(sorted[0].start_date)
    const end = new Date(sorted[sorted.length - 1].end_date)
    const total = end - start
    const elapsed = today - start
    return Math.min(Math.max(Math.round((elapsed / total) * 100), 0), 100)
  }

  function getPhaseColor(type) {
    switch (type) {
      case 'run': return colors.run
      case 'cross_training': return colors.crossTraining
      case 'recovery': return colors.recovery
      default: return colors.primary
    }
  }

  async function onRefresh() {
    setRefreshing(true)
    await fetchPlans()
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
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
      }
    >
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>My Plans</Text>
        <TouchableOpacity
          style={styles.addButton}
          onPress={() => router.push('/onboarding')}
        >
          <Text style={styles.addButtonText}>+ New Plan</Text>
        </TouchableOpacity>
      </View>

      {/* No plans state */}
      {plans.length === 0 && (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyTitle}>No plans yet!</Text>
          <Text style={styles.emptySubtitle}>
            Create a plan and Claude will generate your daily tasks
          </Text>
          <TouchableOpacity
            style={styles.createButton}
            onPress={() => router.push('/onboarding')}
          >
            <Text style={styles.createButtonText}>Create My First Plan</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Plans */}
      {plans.map(plan => {
        const currentPhase = getPhaseForToday(plan.plan_phases)
        const progress = getProgressPercent(plan.plan_phases)

        return (
          <View key={plan.id} style={[
            styles.planCard,
            !plan.active && styles.planCardInactive
          ]}>
            {/* Plan Header */}
            <View style={styles.planHeader}>
              <View style={styles.planTitleRow}>
                <View style={[
                  styles.activeDot,
                  { backgroundColor: plan.active ? colors.run : colors.textLight }
                ]} />
                <Text style={styles.planName}>{plan.name}</Text>
              </View>
              <TouchableOpacity
                style={[
                  styles.toggleButton,
                  { backgroundColor: plan.active ? colors.run : colors.border }
                ]}
                onPress={() => togglePlan(plan.id, plan.active)}
              >
                <Text style={[
                  styles.toggleText,
                  { color: plan.active ? colors.white : colors.textSecondary }
                ]}>
                  {plan.active ? 'Active' : 'Paused'}
                </Text>
              </TouchableOpacity>
            </View>

            {/* Plan Meta */}
            <View style={styles.planMeta}>
              <Text style={styles.metaText}>
                Goal: {plan.goal_mileage} miles/week
              </Text>
              <Text style={styles.metaText}>
                Started: {new Date(plan.start_date).toLocaleDateString('en-US', {
                  month: 'short', day: 'numeric', year: 'numeric'
                })}
              </Text>
            </View>

            {/* Overall Progress */}
            <View style={styles.progressSection}>
              <View style={styles.progressLabelRow}>
                <Text style={styles.progressLabel}>Overall Progress</Text>
                <Text style={styles.progressPercent}>{progress}%</Text>
              </View>
              <View style={styles.progressBarBg}>
                <View style={[
                  styles.progressBarFill,
                  { width: `${progress}%`, backgroundColor: plan.active ? colors.run : colors.border }
                ]} />
              </View>
            </View>

            {/* Current Phase */}
            {currentPhase && (
              <View style={[
                styles.currentPhaseCard,
                { borderLeftColor: getPhaseColor(currentPhase.phase_type) }
              ]}>
                <Text style={styles.currentPhaseLabel}>Current Phase</Text>
                <Text style={styles.currentPhaseName}>{currentPhase.name}</Text>
                <Text style={styles.currentPhaseDesc}>{currentPhase.description}</Text>
                <Text style={styles.currentPhaseDates}>
                  {new Date(currentPhase.start_date).toLocaleDateString('en-US', {
                    month: 'short', day: 'numeric'
                  })} → {new Date(currentPhase.end_date).toLocaleDateString('en-US', {
                    month: 'short', day: 'numeric'
                  })}
                </Text>
              </View>
            )}

            {/* All Phases */}
            <Text style={styles.phasesTitle}>All Phases</Text>
            {plan.plan_phases
              ?.sort((a, b) => a.phase_order - b.phase_order)
              .map((phase, i) => {
                const today = new Date().toISOString().split('T')[0]
                const isComplete = phase.end_date < today
                const isCurrent = phase.start_date <= today && phase.end_date >= today
                const isFuture = phase.start_date > today

                return (
                  <View key={phase.id} style={styles.phaseRow}>
                    <View style={[
                      styles.phaseIcon,
                      {
                        backgroundColor: isComplete
                          ? colors.run
                          : isCurrent
                            ? getPhaseColor(phase.phase_type)
                            : colors.border
                      }
                    ]}>
                      <Text style={styles.phaseIconText}>
                        {isComplete ? '✓' : i + 1}
                      </Text>
                    </View>
                    <View style={styles.phaseInfo}>
                      <Text style={[
                        styles.phaseName,
                        isCurrent && styles.phaseNameCurrent,
                        isComplete && styles.phaseNameComplete,
                      ]}>
                        {phase.name}
                      </Text>
                      <Text style={styles.phaseDates}>
                        {new Date(phase.start_date).toLocaleDateString('en-US', {
                          month: 'short', day: 'numeric'
                        })} → {new Date(phase.end_date).toLocaleDateString('en-US', {
                          month: 'short', day: 'numeric'
                        })}
                      </Text>
                    </View>
                    <View style={[
                      styles.phaseStatus,
                      {
                        backgroundColor: isComplete
                          ? '#E8F5E9'
                          : isCurrent
                            ? '#E3F2FD'
                            : colors.lightGray
                      }
                    ]}>
                      <Text style={[
                        styles.phaseStatusText,
                        {
                          color: isComplete
                            ? colors.run
                            : isCurrent
                              ? colors.crossTraining
                              : colors.textLight
                        }
                      ]}>
                        {isComplete ? 'Done' : isCurrent ? 'Now' : 'Soon'}
                      </Text>
                    </View>
                  </View>
                )
              })}

            {/* Delete */}
            <TouchableOpacity
              style={styles.deleteButton}
              onPress={() => deletePlan(plan.id)}
            >
              <Text style={styles.deleteText}>Delete Plan</Text>
            </TouchableOpacity>
          </View>
        )
      })}

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
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 24,
    paddingBottom: 12,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: colors.textPrimary,
  },
  addButton: {
    backgroundColor: colors.primaryDark,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  addButtonText: {
    color: colors.white,
    fontWeight: '600',
    fontSize: 14,
  },
  emptyCard: {
    backgroundColor: colors.white,
    margin: 16,
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    gap: 8,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: colors.textPrimary,
  },
  emptySubtitle: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
  },
  createButton: {
    backgroundColor: colors.primaryDark,
    borderRadius: 12,
    padding: 14,
    alignItems: 'center',
    marginTop: 8,
    width: '100%',
  },
  createButtonText: {
    color: colors.white,
    fontWeight: '700',
    fontSize: 15,
  },
  planCard: {
    backgroundColor: colors.white,
    margin: 16,
    marginBottom: 8,
    borderRadius: 16,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
  },
  planCardInactive: {
    opacity: 0.7,
  },
  planHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  planTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  activeDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  planName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: colors.textPrimary,
    flex: 1,
  },
  toggleButton: {
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  toggleText: {
    fontSize: 13,
    fontWeight: '600',
  },
  planMeta: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 16,
  },
  metaText: {
    fontSize: 13,
    color: colors.textSecondary,
  },
  progressSection: {
    marginBottom: 16,
  },
  progressLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  progressLabel: {
    fontSize: 13,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  progressPercent: {
    fontSize: 13,
    color: colors.textPrimary,
    fontWeight: '700',
  },
  progressBarBg: {
    height: 6,
    backgroundColor: colors.border,
    borderRadius: 3,
  },
  progressBarFill: {
    height: 6,
    borderRadius: 3,
  },
  currentPhaseCard: {
    backgroundColor: '#F8F9FA',
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
    borderLeftWidth: 4,
  },
  currentPhaseLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 4,
  },
  currentPhaseName: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: 4,
  },
  currentPhaseDesc: {
    fontSize: 13,
    color: colors.textSecondary,
    lineHeight: 18,
    marginBottom: 6,
  },
  currentPhaseDates: {
    fontSize: 12,
    color: colors.textLight,
  },
  phasesTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 10,
  },
  phaseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 10,
  },
  phaseIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  phaseIconText: {
    color: colors.white,
    fontSize: 13,
    fontWeight: 'bold',
  },
  phaseInfo: {
    flex: 1,
  },
  phaseName: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.textSecondary,
  },
  phaseNameCurrent: {
    color: colors.textPrimary,
    fontWeight: '700',
  },
  phaseNameComplete: {
    color: colors.textSecondary,
    textDecorationLine: 'line-through',
  },
  phaseDates: {
    fontSize: 12,
    color: colors.textLight,
    marginTop: 2,
  },
  phaseStatus: {
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  phaseStatusText: {
    fontSize: 12,
    fontWeight: '600',
  },
  deleteButton: {
    marginTop: 16,
    padding: 12,
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  deleteText: {
    color: colors.danger,
    fontSize: 14,
    fontWeight: '500',
  },
})