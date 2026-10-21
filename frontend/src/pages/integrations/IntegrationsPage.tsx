import React, { useState } from 'react';
import { KeyRound, Webhook } from 'lucide-react';
import { PageHeader } from '../../components/ui/PageHeader';
import { Tabs } from '../../components/ui/Tabs';
import { useI18n } from '../../i18n';
import { ApiKeysPanel } from './ApiKeysPanel';
import { WebhooksPanel } from './WebhooksPanel';

type IntegrationsTab = 'api-keys' | 'webhooks';

/** API keys (plan feature API_ACCESS) and outbound webhooks (plan feature WEBHOOKS). Organization administrators only. */
export const IntegrationsPage: React.FC = () => {
  const { t } = useI18n();
  const [tab, setTab] = useState<IntegrationsTab>('api-keys');

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <PageHeader
        title={t('nav.integrations')}
        description="Connect ERP, BI and maintenance systems to your 5S data with API keys and signed webhooks."
      />

      <Tabs
        tabs={[
          { id: 'api-keys', label: 'API keys', icon: <KeyRound size={16} /> },
          { id: 'webhooks', label: 'Webhooks', icon: <Webhook size={16} /> },
        ]}
        activeTab={tab}
        onChange={(id) => setTab(id === 'webhooks' ? 'webhooks' : 'api-keys')}
        ariaLabel="Integration type"
      />

      {tab === 'api-keys' ? <ApiKeysPanel /> : <WebhooksPanel />}
    </div>
  );
};
