import Toast from 'react-native-toast-message';

import ForgotPasswordForm from '@/src/components/forms/ForgotPasswordForm';

export default function ForgotPasswordModal() {
  return (
    <>
      <ForgotPasswordForm />
      <Toast />
    </>
  );
}
