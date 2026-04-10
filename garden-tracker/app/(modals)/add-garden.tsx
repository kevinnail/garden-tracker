import Toast from 'react-native-toast-message';

import AddGardenForm from '@/src/components/forms/AddGardenForm';

export default function AddGardenModal() {
  return (
    <>
      <AddGardenForm />
      <Toast />
    </>
  );
}
