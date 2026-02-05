import { StatusBar } from 'expo-status-bar';
import { SafeAreaView } from 'react-native';
import StatesScreen from './screens/StatesScreen';
import React from 'react';

export default function App() {
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#ffffff' }}>
      <StatesScreen />
      <StatusBar style="dark" />
    </SafeAreaView>
  );
}
