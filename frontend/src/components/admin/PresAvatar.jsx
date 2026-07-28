import { useEffect, useState } from 'react';
import * as avatarService from '../../services/avatarService';
import { initials } from './adminPresenceHelpers';

// Avatar d'un employé sur la page Présence (photo si dispo, sinon initiales). Extrait d'AdminPresence.
function PresAvatar({ user }) {
  const [url, setUrl] = useState(null);
  useEffect(() => {
    let obj;
    if (user.has_avatar) {
      avatarService
        .getUserAvatarBlob(user.id)
        .then((blob) => {
          obj = URL.createObjectURL(blob);
          setUrl(obj);
        })
        .catch(() => setUrl(null));
    } else {
      setUrl(null);
    }
    return () => {
      if (obj) URL.revokeObjectURL(obj);
    };
  }, [user.id, user.has_avatar]);

  return url ? (
    <img src={url} alt={user.full_name} className="pres-avatar pres-avatar--img" />
  ) : (
    <span className="pres-avatar">{initials(user.full_name)}</span>
  );
}

export default PresAvatar;
