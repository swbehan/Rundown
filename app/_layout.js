import { useEffect, useState } from 'react'
import { Stack, router } from 'expo-router'
import { supabase } from '../lib/supabase'
import { LogBox, View, ActivityIndicator } from 'react-native'
import colors from '../constants/colors'

LogBox.ignoreLogs([
  'Failed to create storage directory',
  'Auto refresh tick failed',
  'AsyncStorage',
])

export default function RootLayout() {
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Check for existing session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setLoading(false)
    })

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
      if (session) {
        router.replace('/(tabs)/today')
      } else {
        router.replace('/')
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    )
  }

  return (
    <Stack>
      <Stack.Screen
        name="index"
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="(tabs)"
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="onboarding"
        options={{ headerShown: false }}
      />
    </Stack>
  )
}