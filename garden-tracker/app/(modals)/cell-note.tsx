import { useLocalSearchParams } from 'expo-router';
import Toast from 'react-native-toast-message';

import CellNoteForm from '@/src/components/forms/CellNoteForm';

export default function CellNoteModal() {
  const params = useLocalSearchParams<{ cropId?: string; weekDate?: string; mode?: string }>();
  const cropId = Number(params.cropId);
  const weekDate = typeof params.weekDate === 'string' ? params.weekDate : '';
  const initialMode = params.mode === 'compose' ? 'compose' : 'view';

  if (!cropId || !weekDate) {
    return null;
  }

  return (
    <>
      <CellNoteForm cropId={cropId} weekDate={weekDate} initialMode={initialMode} />
      <Toast />
    </>
  );
}
