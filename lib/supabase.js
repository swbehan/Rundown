import { createClient } from '@supabase/supabase-js'
import { Platform } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY

// In-memory store that persists within the app session
const memoryStore = {}
const inMemoryStorage = {
  getItem: async (key) => memoryStore[key] ?? null,
  setItem: async (key, value) => { memoryStore[key] = value },
  removeItem: async (key) => { delete memoryStore[key] },
}

const storage = Platform.OS === 'ios' && __DEV__ 
  ? inMemoryStorage 
  : AsyncStorage

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
})