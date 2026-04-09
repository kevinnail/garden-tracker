import React from 'react';
import { View, Pressable, Text, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function PlannerToolbar() {
  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={styles.safeArea}>
      <View style={styles.bar}>
        <Pressable style={styles.btn} onPress={() => router.push('/(modals)/add-crop')}>
          <Text style={styles.btnText}>+ Crop</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    backgroundColor: '#111',
  },
  bar: {
    flexDirection: 'row',
    backgroundColor: '#111',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
    gap: 8,
  },
  btn: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    backgroundColor: '#2ecc71',
    borderRadius: 6,
  },
  btnText: {
    color: '#111',
    fontWeight: 'bold',
    fontSize: 13,
  },
});
