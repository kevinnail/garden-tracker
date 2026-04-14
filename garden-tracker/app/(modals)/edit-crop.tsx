import { useEffect } from 'react';
import { useWindowDimensions } from 'react-native';
import { useNavigation } from 'expo-router';
import Toast from 'react-native-toast-message';

import EditCropModal from '@/src/components/forms/EditCropModal';

export default function EditCropRoute() {
  const { width, height } = useWindowDimensions();
  const isLandscape = width > height;
  const navigation = useNavigation();

  useEffect(() => {
    navigation.setOptions({ headerShown: !isLandscape });
  }, [isLandscape, navigation]);

  return (
    <>
      <EditCropModal />
      <Toast />
    </>
  );
}
