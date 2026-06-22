import Toast from 'react-native-toast-message';

import ResetPasswordForm from '@/src/components/forms/ResetPasswordForm';

export default function ResetPasswordModal() {
  return (
    <>
      <ResetPasswordForm />
      <Toast />
    </>
  );
}
