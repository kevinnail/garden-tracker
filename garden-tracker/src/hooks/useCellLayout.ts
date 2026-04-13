import { ZOOM_LEVELS } from '@/src/constants/layout';
import { usePlannerStore } from '@/src/store/plannerStore';

/**
 * Returns zoom-aware cell dimensions.
 * All grid components use this instead of importing CELL_WIDTH / ROW_HEIGHT directly,
 * so the grid re-renders correctly when the user changes zoom level.
 */
export function useCellLayout() {
  const level = usePlannerStore(s => s.cellZoomLevel);
  return ZOOM_LEVELS[level - 1];
}
