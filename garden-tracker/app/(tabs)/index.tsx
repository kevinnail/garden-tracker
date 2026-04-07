import { View, StyleSheet } from 'react-native';

import PlannerGrid from '@/src/components/planner/PlannerGrid';

export default function PlannerScreen() {
  return (
    <View style={styles.container}>
      <PlannerGrid />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
