import Toast from 'react-native-toast-message';

import SignInForm from '@/src/components/forms/SignInForm';

export default function SignInModal() {
  return (
    <>
      <SignInForm />
      <Toast />
    </>
  );
}
