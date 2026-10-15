import type { Profile as ProfileFields } from '../../../shared/types';
import { useApi } from '../api';
import { PasswordSettings } from '../components/PasswordSettings';
import { ProfileForm } from '../components/ProfileForm';
import { useSession } from '../session';

export function Profile() {
  const api = useApi();
  const { user, refresh } = useSession();
  const initial: ProfileFields = {
    name: user.name,
    timeZone: user.timeZone,
    level: user.level,
    nativeLanguage: user.nativeLanguage,
    goals: user.goals,
    contact: user.contact,
  };

  return (
    <>
      <h2>My profile</h2>
      <ProfileForm
        initial={initial}
        email={user.email}
        submitLabel="Save profile"
        student={user.role === 'STUDENT'}
        onSubmit={async (profile) => {
          await api('updateProfile', profile);
          refresh();
        }}
      />
      <PasswordSettings />
    </>
  );
}
