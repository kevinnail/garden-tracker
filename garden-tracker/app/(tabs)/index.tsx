import { View, StyleSheet } from 'react-native';

import { usePlannerData } from '@/src/hooks/usePlannerData';
import PlannerGrid from '@/src/components/planner/PlannerGrid';

export default function PlannerScreen() {
  usePlannerData();
  return (
    <View style={styles.container}>
      <PlannerGrid />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
});
