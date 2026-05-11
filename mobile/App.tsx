import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { CaptureFingerprintScreen } from './src/screens/CaptureFingerprintScreen';
import { CheckinScreen } from './src/screens/CheckinScreen';
import { EventDashboardScreen } from './src/screens/EventDashboardScreen';
import { HomeScreen } from './src/screens/HomeScreen';
import { InviteesScreen } from './src/screens/InviteesScreen';
import { colors } from './src/theme';
import type { RootStackParamList } from './src/navigation';

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function App() {
  return (
    <SafeAreaProvider>
      <NavigationContainer>
        <Stack.Navigator
          screenOptions={{
            headerStyle: { backgroundColor: colors.primary },
            headerTintColor: '#fff',
            headerTitleStyle: { fontWeight: '700' },
          }}
        >
          <Stack.Screen name="Home" component={HomeScreen} options={{ title: 'Quorum' }} />
          <Stack.Screen name="EventDashboard" component={EventDashboardScreen} />
          <Stack.Screen
            name="Checkin"
            component={CheckinScreen}
            options={{ title: 'Check in' }}
          />
          <Stack.Screen
            name="CaptureFingerprint"
            component={CaptureFingerprintScreen}
            options={{ title: 'Capture fingerprint' }}
          />
          <Stack.Screen name="Invitees" component={InviteesScreen} />
        </Stack.Navigator>
      </NavigationContainer>
      <StatusBar style="light" />
    </SafeAreaProvider>
  );
}
