import Toast from 'react-native-toast-message';

import AddTaskForm from '@/src/components/forms/AddTaskForm';

export default function AddTaskModal() {
  return (
    <>
      <AddTaskForm />
      <Toast />
    </>
  );
}
