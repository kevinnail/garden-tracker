import Toast from 'react-native-toast-message';

import AddLocationForm from '@/src/components/forms/AddLocationForm';

export default function AddLocationModal() {
  return (
    <>
      <AddLocationForm />
      <Toast />
    </>
  );
}