import { Tabs } from 'expo-router'
import { Text, StyleSheet } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import colors from '../../constants/colors'

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        tabBarStyle: {
          backgroundColor: colors.darkHeader,
          borderTopColor: colors.borderDark,
          height: 60,
          paddingBottom: 8,
        },
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textOnDarkSecondary,
        headerStyle: {
          backgroundColor: colors.darkHeader,
        },
        headerTintColor: colors.textOnDark,
        headerTitleStyle: {
          fontWeight: '900',
          fontSize: 18,
          letterSpacing: 2,
          textTransform: 'uppercase',
        },
      }}
    >
      <Tabs.Screen
        name="today"
        options={{
          title: 'TODAY',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="flash" size={size} color={color} />
          ),
          tabBarLabel: ({ focused }) => (
            <Text style={[styles.tabText, { color: focused ? colors.primary : colors.textOnDarkSecondary }]}>
              TODAY
            </Text>
          ),
        }}
      />
      <Tabs.Screen
        name="plan"
        options={{
          title: 'PLAN',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="calendar" size={size} color={color} />
          ),
          tabBarLabel: ({ focused }) => (
            <Text style={[styles.tabText, { color: focused ? colors.primary : colors.textOnDarkSecondary }]}>
              PLAN
            </Text>
          ),
        }}
      />
      <Tabs.Screen
        name="progress"
        options={{
          title: 'PROGRESS',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="trending-up" size={size} color={color} />
          ),
          tabBarLabel: ({ focused }) => (
            <Text style={[styles.tabText, { color: focused ? colors.primary : colors.textOnDarkSecondary }]}>
              PROGRESS
            </Text>
          ),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'SETTINGS',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="person" size={size} color={color} />
          ),
          tabBarLabel: ({ focused }) => (
            <Text style={[styles.tabText, { color: focused ? colors.primary : colors.textOnDarkSecondary }]}>
              ME
            </Text>
          ),
        }}
      />
    </Tabs>
  )
}

const styles = StyleSheet.create({
  tabText: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1,
  },
})