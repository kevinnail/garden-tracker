import Toast from 'react-native-toast-message';

import TaskAssessForm from '@/src/components/forms/TaskAssessForm';

export default function ManageTasksModal() {
  return (
    <>
      <TaskAssessForm />
      <Toast />
    </>
  );
}
