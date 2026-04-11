import { useEffect } from 'react';
import { usePlannerStore } from '@/src/store/plannerStore';

export function usePlannerData() {
  const loadData = usePlannerStore(s => s.loadData);
  useEffect(() => {
    void loadData().catch(() => {/* toast shown by store */});
  }, [loadData]);
}
