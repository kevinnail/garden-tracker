import Toast from 'react-native-toast-message';

import AddCropForm from '@/src/components/forms/AddCropForm';

export default function AddCropModal() {
  return (
    <>
      <AddCropForm />
      <Toast />
    </>
  );
}
