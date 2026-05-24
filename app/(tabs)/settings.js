import { useState, useEffect } from 'react'
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  ActivityIndicator,
} from 'react-native'
import { supabase } from '../../lib/supabase'
import { connectStrava } from '../../lib/strava'
import colors from '../../constants/colors'
import { router } from 'expo-router'

export default function SettingsScreen() {
  const [user, setUser] = useState(null)
  const [stravaConnected, setStravaConnected] = useState(false)
  const [stravaAthlete, setStravaAthlete] = useState(null)
  const [loading, setLoading] = useState(true)
  const [connectingStrava, setConnectingStrava] = useState(false)

  useEffect(() => {
    fetchUserData()
  }, [])

  async function fetchUserData() {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      
      if (!user) return  // Add this line
      
      setUser(user)

      // Check if Strava is connected
      const { data: integration } = await supabase
        .from('user_integrations')
        .select('*')
        .eq('user_id', user.id)
        .eq('provider', 'strava')
        .single()

      if (integration) {
        setStravaConnected(true)
        setStravaAthlete(integration)
      }
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  async function handleConnectStrava() {
    setConnectingStrava(true)
    try {
      const result = await connectStrava()
      setStravaConnected(true)
      setStravaAthlete(result.athlete)
      Alert.alert(
        '🎉 Strava Connected!',
        `Welcome ${result.athlete.firstname}! Your activities will now sync automatically.`
      )
    } catch (err) {
      Alert.alert('Error', err.message)
    } finally {
      setConnectingStrava(false)
    }
  }

  async function handleDisconnectStrava() {
    Alert.alert(
      'Disconnect Strava',
      'Are you sure? Your activity history will be kept but no new activities will sync.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Disconnect',
          style: 'destructive',
          onPress: async () => {
            await supabase
              .from('user_integrations')
              .delete()
              .eq('user_id', user.id)
              .eq('provider', 'strava')
            setStravaConnected(false)
            setStravaAthlete(null)
          }
        }
      ]
    )
  }

  async function handleSignOut() {
    Alert.alert(
      'Sign Out',
      'Are you sure you want to sign out?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign Out',
          style: 'destructive',
          onPress: async () => {
            await supabase.auth.signOut()
            router.replace('/')
          }
        }
      ]
    )
  }

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    )
  }

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>

      {/* Profile Section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Profile</Text>
        <View style={styles.card}>
          <Text style={styles.label}>Email</Text>
          <Text style={styles.value}>{user?.email}</Text>
        </View>
      </View>

      {/* Strava Section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Integrations</Text>
        <View style={styles.card}>
          <View style={styles.integrationRow}>
            <View style={styles.integrationInfo}>
              <Text style={styles.integrationName}>🟠 Strava</Text>
              <Text style={styles.integrationStatus}>
                {stravaConnected ? '✓ Connected' : 'Not connected'}
              </Text>
            </View>
            {stravaConnected ? (
              <TouchableOpacity
                style={styles.disconnectButton}
                onPress={handleDisconnectStrava}
              >
                <Text style={styles.disconnectText}>Disconnect</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={styles.connectButton}
                onPress={handleConnectStrava}
                disabled={connectingStrava}
              >
                {connectingStrava
                  ? <ActivityIndicator color={colors.white} size="small" />
                  : <Text style={styles.connectText}>Connect</Text>
                }
              </TouchableOpacity>
            )}
          </View>
          {stravaConnected && (
            <Text style={styles.connectedNote}>
              Activities sync automatically after each run
            </Text>
          )}
        </View>
      </View>

      {/* Sign Out */}
      <View style={styles.section}>
        <TouchableOpacity
          style={styles.signOutButton}
          onPress={handleSignOut}
        >
          <Text style={styles.signOutText}>Sign Out</Text>
        </TouchableOpacity>
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
  },
  section: {
    padding: 16,
    paddingBottom: 0,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 8,
    marginLeft: 4,
  },
  card: {
    backgroundColor: colors.white,
    borderRadius: 12,
    padding: 16,
    marginBottom: 8,
  },
  label: {
    fontSize: 13,
    color: colors.textSecondary,
    marginBottom: 4,
  },
  value: {
    fontSize: 16,
    color: colors.textPrimary,
    fontWeight: '500',
  },
  integrationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  integrationInfo: {
    flex: 1,
  },
  integrationName: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  integrationStatus: {
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: 2,
  },
  connectButton: {
    backgroundColor: '#FC4C02',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
    minWidth: 90,
    alignItems: 'center',
  },
  connectText: {
    color: colors.white,
    fontWeight: '600',
    fontSize: 14,
  },
  disconnectButton: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  disconnectText: {
    color: colors.textSecondary,
    fontSize: 14,
  },
  connectedNote: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 8,
    fontStyle: 'italic',
  },
  signOutButton: {
    backgroundColor: colors.white,
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.danger,
  },
  signOutText: {
    color: colors.danger,
    fontSize: 16,
    fontWeight: '600',
  },
})