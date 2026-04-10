import { useLocalSearchParams } from 'expo-router';
import Toast from 'react-native-toast-message';

import CellNoteForm from '@/src/components/forms/CellNoteForm';

export default function CellNoteModal() {
  const params = useLocalSearchParams<{ cropId?: string; weekDate?: string }>();
  const cropId = Number(params.cropId);
  const weekDate = typeof params.weekDate === 'string' ? params.weekDate : '';

  if (!cropId || !weekDate) {
    return null;
  }

  return (
    <>
      <CellNoteForm cropId={cropId} weekDate={weekDate} />
      <Toast />
    </>
  );
}
