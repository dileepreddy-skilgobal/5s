import React, { useEffect, useState } from 'react';
import { ImageIcon, Save } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { getApiErrorMessage } from '../../services/api';
import { adminApi } from '../../services/adminApi';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { TenantLogoUploader } from '../../components/common/TenantLogoUploader';

/** Settings → General: the organization logo, saved on its own (PUT /settings/logo) and kept in file storage. */
export const OrganizationLogoCard: React.FC = () => {
  const { currentTenant, refreshSession, addToast } = useApp();
  const savedLogo = currentTenant?.logoUrl || '';
  const [logo, setLogo] = useState(savedLogo);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  // A refreshed session brings a newly signed URL for the same logo; only follow it while nothing is pending
  useEffect(() => {
    if (!dirty) setLogo(savedLogo);
  }, [savedLogo, dirty]);

  const save = async () => {
    setSaving(true);
    try {
      await adminApi.setOrganizationLogo(logo || null);
      setDirty(false);
      addToast({ type: 'success', title: logo ? 'Logo saved' : 'Logo removed', message: logo ? 'The new logo is shown across the app, reports and certificates.' : 'Your organization no longer shows a logo.' });
      // The header and other screens read the logo from the session
      await refreshSession().catch(() => undefined);
    } catch (err) {
      addToast({ type: 'error', title: 'Logo not saved', message: getApiErrorMessage(err, 'Could not save the logo.') });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card
      title={
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
          <ImageIcon size={18} aria-hidden="true" style={{ color: 'var(--color-primary)' }} /> Organization logo
        </span>
      }
      subtitle="Saved separately from the other general settings."
      actions={
        <>
          <Button
            variant="secondary"
            disabled={!dirty || saving}
            onClick={() => {
              setLogo(savedLogo);
              setDirty(false);
            }}
          >
            Discard
          </Button>
          <Button variant="primary" icon={<Save size={16} />} loading={saving} disabled={!dirty} onClick={save}>
            Save logo
          </Button>
        </>
      }
    >
      <TenantLogoUploader
        value={logo}
        disabled={saving}
        onChange={(next) => {
          setLogo(next);
          setDirty(true);
        }}
      />
    </Card>
  );
};
