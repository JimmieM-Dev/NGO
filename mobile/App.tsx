import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { CaptureFingerprintScreen } from './src/screens/CaptureFingerprintScreen';
import { DuplicatesScreen } from './src/screens/DuplicatesScreen';
import { EventDashboardScreen } from './src/screens/EventDashboardScreen';
import { HomeScreen } from './src/screens/HomeScreen';
import { RegisterScreen } from './src/screens/RegisterScreen';
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
          <Stack.Screen name="Home" component={HomeScreen} options={{ title: 'NGO Events' }} />
          <Stack.Screen name="EventDashboard" component={EventDashboardScreen} />
          <Stack.Screen name="Register" component={RegisterScreen} options={{ title: 'Register attendee' }} />
          <Stack.Screen
            name="CaptureFingerprint"
            component={CaptureFingerprintScreen}
            options={{ title: 'Capture fingerprint' }}
          />
          <Stack.Screen name="Duplicates" component={DuplicatesScreen} />
        </Stack.Navigator>
      </NavigationContainer>
      <StatusBar style="light" />
    </SafeAreaProvider>
  );
}
