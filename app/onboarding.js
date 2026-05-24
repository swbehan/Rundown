import { useState } from 'react'
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native'
import { supabase } from '../lib/supabase'
import colors from '../constants/colors'
import { router } from 'expo-router'

const PLAN_TYPES = [
  {
    key: 'running',
    label: 'Running',
    emoji: '🏃',
    description: 'Return to run, mileage building, race training',
    color: colors.run,
  },
  {
    key: 'gym',
    label: 'Gym',
    emoji: '🏋️',
    description: 'Strength, hypertrophy, conditioning',
    color: colors.pt,
  },
]

const SURFACES = ['Track', 'Trail', 'Treadmill', 'Road', 'Turf']
const LONG_RUN_DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
const REST_DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
const STRETCHING_EQUIPMENT = ['Foam roller', 'Resistance bands', 'Yoga mat', 'Massage gun', 'Lacrosse ball', 'Nothing']
const GYM_SPLITS = ['Push/Pull/Legs', 'Upper/Lower', 'Full Body', 'Bro Split', 'Not sure']
const GYM_GOALS = ['Strength', 'Hypertrophy (size)', 'Endurance', 'General fitness']
const GYM_EQUIPMENT = ['Full gym', 'Home gym', 'Barbell only', 'Dumbbells only', 'Bodyweight only']

export default function OnboardingScreen() {
  const [step, setStep] = useState(1)
  const [planType, setPlanType] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [generatedPlan, setGeneratedPlan] = useState(null)

  // Running fields
  const [planName, setPlanName] = useState('')
  const [goalMileage, setGoalMileage] = useState('')
  const [currentMileage, setCurrentMileage] = useState('')
  const [longRunDay, setLongRunDay] = useState('')
  const [restDay, setRestDay] = useState([])
  const [hasInjury, setHasInjury] = useState(false)
  const [injuryDetails, setInjuryDetails] = useState('')
  const [injuryDuration, setInjuryDuration] = useState('')
  const [selectedSurfaces, setSelectedSurfaces] = useState([])
  const [shoesOrthotics, setShoesOrthotics] = useState('')
  const [selectedStretching, setSelectedStretching] = useState([])

  // Gym fields
  const [gymGoal, setGymGoal] = useState('')
  const [gymDaysPerWeek, setGymDaysPerWeek] = useState('')
  const [gymFrequency, setGymFrequency] = useState('')
  const [gymEquipment, setGymEquipment] = useState('')
  const [gymSplit, setGymSplit] = useState('')
  const [gymInjuries, setGymInjuries] = useState('')

  function toggleItem(list, setList, item) {
    setList(prev =>
      prev.includes(item) ? prev.filter(i => i !== item) : [...prev, item]
    )
  }

  function selectSingle(current, setter, value) {
    setter(current === value ? '' : value)
  }

  async function handleGeneratePlan() {
    if (!planName) {
      setError('Please give your plan a name')
      return
    }
    if (planType === 'running' && !goalMileage) {
      setError('Please enter your goal mileage')
      return
    }

    setLoading(true)
    setError(null)

    try {
      const { data: { session } } = await supabase.auth.getSession()

      let injuryDescription, currentFitness, additionalContext

      if (planType === 'running') {
        injuryDescription = hasInjury && injuryDetails
  ? `${injuryDetails}. Injured for: ${injuryDuration}`
  : 'No current injury'
        currentFitness = `Currently running ${currentMileage || 0} miles/week`
        additionalContext = [
          longRunDay && `Long run day: ${longRunDay}`,
          restDay.length > 0 && `Select Your Rest Days ${restDay.join(', ')}`,
          selectedSurfaces.length > 0 && `Preferred surfaces: ${selectedSurfaces.join(', ')}`,
          shoesOrthotics && `Shoes/orthotics: ${shoesOrthotics}`,
          selectedStretching.length > 0 && `Stretching equipment available: ${selectedStretching.join(', ')}`,
        ].filter(Boolean).join('. ')
      } else {
        injuryDescription = gymInjuries || 'No current injury'
        currentFitness = `Lifts ${gymFrequency || 'occasionally'}. Goal: ${gymGoal}`
        additionalContext = [
          gymDaysPerWeek && `Training ${gymDaysPerWeek} days/week`,
          gymEquipment && `Equipment: ${gymEquipment}`,
          gymSplit && `Preferred split: ${gymSplit}`,
        ].filter(Boolean).join('. ')
      }

      const { data, error } = await supabase.functions.invoke('generate-plan', {
        body: JSON.stringify({
          userId: session.user.id,
          planName,
          goalMileage: planType === 'running' ? parseInt(goalMileage) : 0,
          injuryDescription,
          currentFitness,
          additionalContext,
        }),
        headers: { 'Content-Type': 'application/json' },
        timeout: 90000,
      })

      if (error) throw error
      setGeneratedPlan(data.plan)

      // Wait for plan data to be committed before generating today's tasks
      await new Promise(resolve => setTimeout(resolve, 2000))
      await supabase.functions.invoke('generate-daily-tasks', {
        body: JSON.stringify({ generateToday: true }),
        headers: { 'Content-Type': 'application/json' },
      })

      setStep(3)

    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  // STEP 1 — Pick plan type
if (step === 1) {
  return (
    <View style={styles.container}>
      
      {/* Back button */}
      <TouchableOpacity 
        style={styles.backButton}
        onPress={() => router.back()}
      >
        <Text style={styles.backButtonText}>← Back</Text>
      </TouchableOpacity>

      <View style={styles.stepHeader}>
          <Text style={styles.stepTitle}>What kind of plan?</Text>
          <Text style={styles.stepSubtitle}>
            Choose the focus of your new training plan
          </Text>
        </View>

        <View style={styles.typeCards}>
          {PLAN_TYPES.map(type => (
            <TouchableOpacity
              key={type.key}
              style={[
                styles.typeCard,
                planType === type.key && {
                  borderColor: type.color,
                  borderWidth: 2,
                  backgroundColor: `${type.color}10`,
                }
              ]}
              onPress={() => setPlanType(type.key)}
            >
              <Text style={styles.typeEmoji}>{type.emoji}</Text>
              <Text style={styles.typeLabel}>{type.label}</Text>
              <Text style={styles.typeDesc}>{type.description}</Text>
              {planType === type.key && (
                <View style={[styles.selectedBadge, { backgroundColor: type.color }]}>
                  <Text style={styles.selectedBadgeText}>Selected</Text>
                </View>
              )}
            </TouchableOpacity>
          ))}
        </View>

        <TouchableOpacity
          style={[styles.nextButton, !planType && styles.nextButtonDisabled]}
          onPress={() => planType && setStep(2)}
          disabled={!planType}
        >
          <Text style={styles.nextButtonText}>Continue →</Text>
        </TouchableOpacity>
      </View>
    )
  }

  // STEP 3 — Plan preview
  if (step === 3 && generatedPlan) {
    return (
      <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
        <View style={styles.stepHeader}>
          <Text style={styles.stepTitle}>Your Plan is Ready!</Text>
          <Text style={styles.stepSubtitle}>Review your AI-generated training plan</Text>
        </View>

        <View style={[styles.planPreviewCard, { borderTopColor: planType === 'running' ? colors.run : colors.pt }]}>
          <Text style={styles.planPreviewName}>{generatedPlan.name}</Text>
          {planType === 'running' && (
            <Text style={styles.planPreviewMeta}>Goal: {generatedPlan.goalMileage} miles/week</Text>
          )}
          <Text style={styles.planPreviewMeta}>
            {generatedPlan.phases?.length} phases · Starts {generatedPlan.startDate}
          </Text>
        </View>

        <View style={styles.insightCard}>
          <Text style={styles.insightLabel}>AI Assessment</Text>
          <Text style={styles.insightText}>{generatedPlan.aiInsight}</Text>
        </View>

        <View style={styles.phasesSection}>
          <Text style={styles.sectionLabel}>Training Phases</Text>
          {generatedPlan.phases?.map((phase, i) => (
            <View key={i} style={styles.phasePreviewCard}>
              <View style={styles.phasePreviewHeader}>
                <Text style={styles.phasePreviewNumber}>Phase {i + 1}</Text>
                <Text style={styles.phasePreviewDates}>
                  {phase.startDate} → {phase.endDate}
                </Text>
              </View>
              <Text style={styles.phasePreviewName}>{phase.name}</Text>
              <Text style={styles.phasePreviewDesc}>{phase.description}</Text>
            </View>
          ))}
        </View>

        {error && <Text style={styles.error}>{error}</Text>}

        <View style={styles.previewButtons}>
          <TouchableOpacity
            style={styles.confirmButton}
            onPress={() => router.replace('/(tabs)/today')}
          >
            <Text style={styles.confirmButtonText}>Start My Plan →</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.regenButton}
            onPress={() => setStep(2)}
          >
            <Text style={styles.regenButtonText}>← Regenerate</Text>
          </TouchableOpacity>
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    )
  }

  // STEP 2 — Fill in details
  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>

        <View style={styles.stepHeader}>
          <TouchableOpacity onPress={() => setStep(1)}>
            <Text style={styles.backLink}>← Back</Text>
          </TouchableOpacity>
          <Text style={styles.stepTitle}>
            {planType === 'running' ? 'Running Plan' : 'Gym Plan'}
          </Text>
          <Text style={styles.stepSubtitle}>
            Tell Claude about your goals and we'll build your plan
          </Text>
        </View>

        {/* Plan Name */}
        <View style={styles.field}>
          <Text style={styles.fieldLabel}>Plan Name *</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. Ankle Recovery — 50mpw"
            placeholderTextColor={colors.textLight}
            value={planName}
            onChangeText={setPlanName}
          />
        </View>

        {planType === 'running' ? (
          <>
            {/* Mileage */}
            <View style={styles.row}>
              <View style={[styles.field, { flex: 1 }]}>
                <Text style={styles.fieldLabel}>Current Miles/Week *</Text>
                <TextInput
                  style={styles.input}
                  placeholder="0"
                  placeholderTextColor={colors.textLight}
                  value={currentMileage}
                  onChangeText={setCurrentMileage}
                  keyboardType="numeric"
                />
              </View>
              <View style={{ width: 12 }} />
              <View style={[styles.field, { flex: 1 }]}>
                <Text style={styles.fieldLabel}>Goal Miles/Week *</Text>
                <TextInput
                  style={styles.input}
                  placeholder="50"
                  placeholderTextColor={colors.textLight}
                  value={goalMileage}
                  onChangeText={setGoalMileage}
                  keyboardType="numeric"
                />
              </View>
            </View>

            {/* Long run day */}
            <View style={styles.field}>
              <Text style={styles.fieldLabel}>Long Run Day</Text>
              <View style={styles.chipRow}>
                {LONG_RUN_DAYS.map(day => (
                  <TouchableOpacity
                    key={day}
                    style={[styles.chip, longRunDay === day && { backgroundColor: colors.run, borderColor: colors.run }]}
                    onPress={() => selectSingle(longRunDay, setLongRunDay, day)}
                  >
                    <Text style={[styles.chipText, longRunDay === day && styles.chipTextSelected]}>
                      {day.substring(0, 3)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Rest day */}
            <View style={styles.field}>
              <Text style={styles.fieldLabel}>Rest Day(s)</Text>
              <View style={styles.chipRow}>
                {REST_DAYS.map(day => (
                  <TouchableOpacity
                    key={day}
                    style={[styles.chip, restDay.includes(day) && { backgroundColor: colors.primaryDark, borderColor: colors.primaryDark }]}
                    onPress={() => toggleItem(restDay, setRestDay, day)}
                  >
                    <Text style={[styles.chipText, restDay.includes(day) && styles.chipTextSelected]}>
                      {day.substring(0, 3)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Injury Toggle */}
<View style={styles.field}>
  <Text style={styles.fieldLabel}>Do You Have an Injury?</Text>
  <View style={styles.toggleRow}>
    <TouchableOpacity
      style={[styles.toggleOption, !hasInjury && styles.toggleOptionSelected]}
      onPress={() => setHasInjury(false)}
    >
      <Text style={[styles.toggleOptionText, !hasInjury && styles.toggleOptionTextSelected]}>
        No Injury
      </Text>
    </TouchableOpacity>
    <TouchableOpacity
      style={[styles.toggleOption, hasInjury && { backgroundColor: colors.danger, borderColor: colors.danger }]}
      onPress={() => setHasInjury(true)}
    >
      <Text style={[styles.toggleOptionText, hasInjury && styles.toggleOptionTextSelected]}>
        Yes, Injured
      </Text>
    </TouchableOpacity>
  </View>
</View>

{/* Injury Details — only show if injured */}
{hasInjury && (
  <>
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>Describe Your Injury</Text>
      <TextInput
        style={[styles.input, styles.textArea]}
        placeholder="e.g. Ankle tendon injury, cleared to return to run"
        placeholderTextColor={colors.textLight}
        value={injuryDetails}
        onChangeText={setInjuryDetails}
        multiline
        numberOfLines={3}
      />
    </View>

    <View style={styles.field}>
      <Text style={styles.fieldLabel}>How Long / Recovery Stage</Text>
      <TextInput
        style={styles.input}
        placeholder="e.g. 8 weeks, returning to run phase"
        placeholderTextColor={colors.textLight}
        value={injuryDuration}
        onChangeText={setInjuryDuration}
      />
    </View>
  </>
)}

            {/* Surfaces */}
            <View style={styles.field}>
              <Text style={styles.fieldLabel}>Preferred Surfaces</Text>
              <View style={styles.chipRow}>
                {SURFACES.map(s => (
                  <TouchableOpacity
                    key={s}
                    style={[styles.chip, selectedSurfaces.includes(s) && { backgroundColor: colors.run, borderColor: colors.run }]}
                    onPress={() => toggleItem(selectedSurfaces, setSelectedSurfaces, s)}
                  >
                    <Text style={[styles.chipText, selectedSurfaces.includes(s) && styles.chipTextSelected]}>
                      {s}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Shoes */}
            <View style={styles.field}>
              <Text style={styles.fieldLabel}>Shoes / Orthotics</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. Brooks Ghost, custom orthotics"
                placeholderTextColor={colors.textLight}
                value={shoesOrthotics}
                onChangeText={setShoesOrthotics}
              />
            </View>

            {/* Stretching equipment */}
            <View style={styles.field}>
              <Text style={styles.fieldLabel}>Stretching Equipment Available</Text>
              <View style={styles.chipRow}>
                {STRETCHING_EQUIPMENT.map(s => (
                  <TouchableOpacity
                    key={s}
                    style={[styles.chip, selectedStretching.includes(s) && { backgroundColor: colors.purple, borderColor: colors.purple }]}
                    onPress={() => toggleItem(selectedStretching, setSelectedStretching, s)}
                  >
                    <Text style={[styles.chipText, selectedStretching.includes(s) && styles.chipTextSelected]}>
                      {s}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          </>
        ) : (
          <>
            {/* Gym Goal */}
            <View style={styles.field}>
              <Text style={styles.fieldLabel}>Primary Goal</Text>
              <View style={styles.chipRow}>
                {GYM_GOALS.map(g => (
                  <TouchableOpacity
                    key={g}
                    style={[styles.chip, gymGoal === g && { backgroundColor: colors.pt, borderColor: colors.pt }]}
                    onPress={() => selectSingle(gymGoal, setGymGoal, g)}
                  >
                    <Text style={[styles.chipText, gymGoal === g && styles.chipTextSelected]}>{g}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Days per week */}
            <View style={styles.field}>
              <Text style={styles.fieldLabel}>Days Per Week</Text>
              <View style={styles.chipRow}>
                {['2', '3', '4', '5', '6'].map(d => (
                  <TouchableOpacity
                    key={d}
                    style={[styles.chip, gymDaysPerWeek === d && { backgroundColor: colors.pt, borderColor: colors.pt }]}
                    onPress={() => selectSingle(gymDaysPerWeek, setGymDaysPerWeek, d)}
                  >
                    <Text style={[styles.chipText, gymDaysPerWeek === d && styles.chipTextSelected]}>{d}x</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Current frequency */}
            <View style={styles.field}>
              <Text style={styles.fieldLabel}>Current Lifting Frequency</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. 3x per week, mostly upper body"
                placeholderTextColor={colors.textLight}
                value={gymFrequency}
                onChangeText={setGymFrequency}
              />
            </View>

            {/* Equipment */}
            <View style={styles.field}>
              <Text style={styles.fieldLabel}>Equipment Available</Text>
              <View style={styles.chipRow}>
                {GYM_EQUIPMENT.map(e => (
                  <TouchableOpacity
                    key={e}
                    style={[styles.chip, gymEquipment === e && { backgroundColor: colors.pt, borderColor: colors.pt }]}
                    onPress={() => selectSingle(gymEquipment, setGymEquipment, e)}
                  >
                    <Text style={[styles.chipText, gymEquipment === e && styles.chipTextSelected]}>{e}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Split */}
            <View style={styles.field}>
              <Text style={styles.fieldLabel}>Preferred Split</Text>
              <View style={styles.chipRow}>
                {GYM_SPLITS.map(s => (
                  <TouchableOpacity
                    key={s}
                    style={[styles.chip, gymSplit === s && { backgroundColor: colors.pt, borderColor: colors.pt }]}
                    onPress={() => selectSingle(gymSplit, setGymSplit, s)}
                  >
                    <Text style={[styles.chipText, gymSplit === s && styles.chipTextSelected]}>{s}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Injuries */}
            <View style={styles.field}>
              <Text style={styles.fieldLabel}>Injuries or Limitations</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                placeholder="e.g. Lower back tightness, avoid overhead pressing"
                placeholderTextColor={colors.textLight}
                value={gymInjuries}
                onChangeText={setGymInjuries}
                multiline
                numberOfLines={3}
              />
            </View>
          </>
        )}

        {error && <Text style={styles.error}>{error}</Text>}

        <TouchableOpacity
          style={styles.generateButton}
          onPress={handleGeneratePlan}
          disabled={loading}
        >
          {loading ? (
            <View style={styles.loadingRow}>
              <ActivityIndicator color={colors.white} />
              <Text style={styles.generateButtonText}>Claude is building your plan...</Text>
            </View>
          ) : (
            <Text style={styles.generateButtonText}>Generate My Plan</Text>
          )}
        </TouchableOpacity>

        <View style={{ height: 60 }} />
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollContent: {
    padding: 20,
  },
  stepHeader: {
    marginBottom: 24,
  },
  backLink: {
    fontSize: 14,
    color: colors.primary,
    marginBottom: 12,
  },
  stepTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: colors.textPrimary,
    marginBottom: 6,
  },
  stepSubtitle: {
    fontSize: 15,
    color: colors.textSecondary,
    lineHeight: 22,
  },
  typeCards: {
    gap: 16,
    marginBottom: 32,
    padding: 20,
  },
  typeCard: {
    backgroundColor: colors.white,
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: colors.border,
    gap: 8,
  },
  typeEmoji: {
    fontSize: 40,
  },
  typeLabel: {
    fontSize: 22,
    fontWeight: 'bold',
    color: colors.textPrimary,
  },
  typeDesc: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  selectedBadge: {
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 4,
    marginTop: 4,
  },
  selectedBadgeText: {
    color: colors.white,
    fontSize: 12,
    fontWeight: '700',
  },
  nextButton: {
    backgroundColor: colors.primaryDark,
    borderRadius: 14,
    padding: 18,
    alignItems: 'center',
    margin: 20,
  },
  nextButtonDisabled: {
    backgroundColor: colors.border,
  },
  nextButtonText: {
    color: colors.white,
    fontSize: 16,
    fontWeight: '700',
  },
  field: {
    marginBottom: 20,
  },
  fieldLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textPrimary,
    marginBottom: 8,
    marginLeft: 2,
  },
  input: {
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: 14,
    fontSize: 15,
    color: colors.textPrimary,
  },
  textArea: {
    height: 90,
    textAlignVertical: 'top',
  },
  row: {
    flexDirection: 'row',
    marginBottom: 0,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: colors.white,
  },
  chipText: {
    fontSize: 13,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  chipTextSelected: {
    color: colors.white,
    fontWeight: '700',
  },
  generateButton: {
    backgroundColor: colors.primaryDark,
    borderRadius: 14,
    padding: 18,
    alignItems: 'center',
    marginTop: 8,
  },
  generateButtonText: {
    color: colors.white,
    fontSize: 16,
    fontWeight: '700',
    marginLeft: 8,
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  error: {
    color: colors.danger,
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 12,
  },
  planPreviewCard: {
    backgroundColor: colors.primaryDark,
    margin: 16,
    borderRadius: 16,
    padding: 20,
    borderTopWidth: 4,
  },
  planPreviewName: {
    fontSize: 22,
    fontWeight: 'bold',
    color: colors.white,
    marginBottom: 8,
  },
  planPreviewMeta: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.8)',
    marginBottom: 4,
  },
  insightCard: {
    backgroundColor: '#FFF8E7',
    margin: 16,
    borderRadius: 12,
    padding: 16,
    borderLeftWidth: 4,
    borderLeftColor: colors.warning,
  },
  insightLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.warning,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 6,
  },
  insightText: {
    fontSize: 14,
    color: colors.textPrimary,
    lineHeight: 20,
  },
  phasesSection: {
    padding: 16,
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 12,
  },
  phasePreviewCard: {
    backgroundColor: colors.white,
    borderRadius: 12,
    padding: 16,
    marginBottom: 8,
  },
  phasePreviewHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  phasePreviewNumber: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.primary,
    textTransform: 'uppercase',
  },
  phasePreviewDates: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  phasePreviewName: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.textPrimary,
    marginBottom: 4,
  },
  phasePreviewDesc: {
    fontSize: 13,
    color: colors.textSecondary,
    lineHeight: 18,
  },
  previewButtons: {
    padding: 16,
    gap: 12,
  },
  confirmButton: {
    backgroundColor: colors.run,
    borderRadius: 14,
    padding: 18,
    alignItems: 'center',
  },
  confirmButtonText: {
    color: colors.white,
    fontSize: 16,
    fontWeight: '700',
  },
  regenButton: {
    alignItems: 'center',
    padding: 12,
  },
  regenButtonText: {
    color: colors.textSecondary,
    fontSize: 14,
  },
  container: {
    flex: 1,
    backgroundColor: colors.background,
    paddingTop: Platform.OS === 'ios' ? 60 : 20,
  },
  scrollContent: {
    padding: 20,
  },
  stepHeader: {
    marginBottom: 24,
    paddingHorizontal: 20,
    paddingTop: 10,
  },
  typeCards: {
    gap: 16,
    marginBottom: 32,
    paddingHorizontal: 20,
  },
  nextButton: {
    backgroundColor: colors.primaryDark,
    borderRadius: 14,
    padding: 18,
    alignItems: 'center',
    marginHorizontal: 20,
    marginBottom: 20,
  },
  toggleRow: {
    flexDirection: 'row',
    gap: 10,
  },
  toggleOption: {
    flex: 1,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.white,
    alignItems: 'center',
  },
  toggleOptionSelected: {
    backgroundColor: colors.run,
    borderColor: colors.run,
  },
  toggleOptionText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textSecondary,
    letterSpacing: 0.5,
  },
  toggleOptionTextSelected: {
    color: colors.white,
  },
})