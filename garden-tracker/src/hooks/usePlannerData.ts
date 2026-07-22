import { useEffect } from 'react';
import { usePlannerStore } from '@/src/store/plannerStore';
import { useTodayTick } from '@/src/hooks/useTodayTick';

export function usePlannerData() {
  const loadData = usePlannerStore((s) => s.loadData);
  // Reload when the local date rolls over: the due/overdue split and task-line
  // data are computed inside loadData against "today", so a re-render alone
  // would leave them showing yesterday's state.
  const today = useTodayTick();
  useEffect(() => {
    void loadData().catch(() => {
      /* toast shown by store */
    });
  }, [loadData, today]);
}
