import { useState } from 'react'
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  StatusBar,
} from 'react-native'
import { supabase } from '../lib/supabase'
import colors from '../constants/colors'

export default function AuthScreen() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [isLogin, setIsLogin] = useState(true)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  async function handleAuth() {
    setLoading(true)
    setError(null)
    try {
      if (isLogin) {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
      } else {
        const { error } = await supabase.auth.signUp({ email, password })
        if (error) throw error
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <StatusBar barStyle="light-content" />

      {/* Top dark section */}
      <View style={styles.topSection}>
        <View style={styles.logoContainer}>
          <Text style={styles.logoText}>RUNDOWN</Text>
          <View style={styles.logoDivider} />
          <Text style={styles.logoTagline}>TRAIN. TRACK. RECOVER.</Text>
        </View>
      </View>

      {/* Bottom white section */}
      <View style={styles.bottomSection}>
        <Text style={styles.formTitle}>
          {isLogin ? 'SIGN IN' : 'CREATE ACCOUNT'}
        </Text>

        {!isLogin && (
          <View style={styles.inputWrapper}>
            <Text style={styles.inputLabel}>NAME</Text>
            <TextInput
              style={styles.input}
              placeholder="Your name"
              placeholderTextColor={colors.textLight}
              value={name}
              onChangeText={setName}
              autoCapitalize="words"
            />
          </View>
        )}

        <View style={styles.inputWrapper}>
          <Text style={styles.inputLabel}>EMAIL</Text>
          <TextInput
            style={styles.input}
            placeholder="you@example.com"
            placeholderTextColor={colors.textLight}
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
          />
        </View>

        <View style={styles.inputWrapper}>
          <Text style={styles.inputLabel}>PASSWORD</Text>
          <TextInput
            style={styles.input}
            placeholder="••••••••"
            placeholderTextColor={colors.textLight}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
          />
        </View>

        {error && <Text style={styles.error}>{error}</Text>}

        <TouchableOpacity
          style={styles.button}
          onPress={handleAuth}
          disabled={loading}
        >
          {loading
            ? <ActivityIndicator color={colors.black} />
            : <Text style={styles.buttonText}>
                {isLogin ? 'SIGN IN' : 'GET STARTED'}
              </Text>
          }
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.switchButton}
          onPress={() => { setIsLogin(!isLogin); setError(null) }}
        >
          <Text style={styles.switchText}>
            {isLogin ? "Don't have an account? " : 'Already have an account? '}
            <Text style={styles.switchTextBold}>
              {isLogin ? 'Sign up' : 'Sign in'}
            </Text>
          </Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.darkHeader,
  },
  topSection: {
    flex: 1,
    backgroundColor: colors.darkHeader,
    justifyContent: 'center',
    alignItems: 'center',
    paddingBottom: 40,
  },
  logoContainer: {
    alignItems: 'center',
    gap: 12,
  },
  logoText: {
    fontSize: 52,
    fontWeight: '900',
    color: colors.white,
    letterSpacing: 8,
  },
  logoDivider: {
    width: 40,
    height: 3,
    backgroundColor: colors.primary,
    borderRadius: 2,
  },
  logoTagline: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textOnDarkSecondary,
    letterSpacing: 4,
  },
  bottomSection: {
    backgroundColor: colors.white,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: 32,
    paddingBottom: 48,
    gap: 16,
  },
  formTitle: {
    fontSize: 22,
    fontWeight: '900',
    color: colors.black,
    letterSpacing: 3,
    marginBottom: 8,
  },
  inputWrapper: {
    gap: 6,
  },
  inputLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.textSecondary,
    letterSpacing: 2,
  },
  input: {
    backgroundColor: colors.background,
    borderRadius: 12,
    padding: 16,
    fontSize: 15,
    color: colors.textPrimary,
    borderWidth: 1,
    borderColor: colors.border,
  },
  button: {
    backgroundColor: colors.primary,
    borderRadius: 12,
    padding: 18,
    alignItems: 'center',
    marginTop: 8,
  },
  buttonText: {
    color: colors.black,
    fontSize: 15,
    fontWeight: '900',
    letterSpacing: 3,
  },
  switchButton: {
    alignItems: 'center',
  },
  switchText: {
    fontSize: 14,
    color: colors.textSecondary,
  },
  switchTextBold: {
    fontWeight: '700',
    color: colors.black,
  },
  error: {
    color: colors.danger,
    fontSize: 13,
    textAlign: 'center',
  },
})