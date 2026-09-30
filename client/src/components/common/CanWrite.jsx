// Renders its children only for roles that may change data (everyone except
// view-only roles such as QB). Wrap Add / Edit / Delete / Approve / Pay
// controls in new code:
//
//   <CanWrite><button onClick={handleDelete}>Delete</button></CanWrite>
//
// Existing pages are also covered by <ViewOnlyGuard /> (mounted in Layout) and,
// as the real safeguard, by the API which rejects every mutation from QB.

import usePermissions from '../../hooks/usePermissions';

const CanWrite = ({ children, fallback = null }) => {
  const { canWrite } = usePermissions();
  return canWrite ? children : fallback;
};

export default CanWrite;
