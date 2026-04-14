import { useLocalSearchParams } from 'expo-router';
import Toast from 'react-native-toast-message';

import CellNoteForm from '@/src/components/forms/CellNoteForm';
import { parseDateKey } from '@/src/utils/dateUtils';

export default function CellNoteModal() {
  const params = useLocalSearchParams<{ cropId?: string; weekDate?: string; mode?: string }>();
  const cropId = parseInt(params.cropId ?? '', 10);
  const weekDate = typeof params.weekDate === 'string' ? params.weekDate : '';
  const initialMode = params.mode === 'compose' ? 'compose' : 'view';

  if (!Number.isInteger(cropId) || cropId <= 0 || !weekDate || !parseDateKey(weekDate)) {
    return null;
  }

  return (
    <>
      <CellNoteForm cropId={cropId} weekDate={weekDate} initialMode={initialMode} />
      <Toast />
    </>
  );
}
