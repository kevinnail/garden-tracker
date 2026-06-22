import Toast from 'react-native-toast-message';

import SignUpForm from '@/src/components/forms/SignUpForm';

export default function SignUpModal() {
  return (
    <>
      <SignUpForm />
      <Toast />
    </>
  );
}
