import { useConfigQuery, useConfigMutation } from '../hooks/useConfig';
import { Card } from '../components/shared/Card';
import { LoadingSpinner } from '../components/shared/LoadingSpinner';
import { ErrorBanner } from '../components/shared/ErrorBanner';
import { DialPanel } from '../components/config/DialPanel';

export function ConfigPage() {
  const config = useConfigQuery();
  const mutation = useConfigMutation();

  function handleSave(values: number[]) {
    mutation.mutate({ values });
  }

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div>
        <p className="font-['Geist_Mono'] text-[11px] uppercase tracking-[0.08em] text-[#37f5a0] mb-1">
          ◐ Prototype · Operator Calibration
        </p>
        <h2 className="font-['Space_Grotesk'] text-2xl font-bold tracking-[-0.03em] text-[#eaf3ee]">
          Dial Configuration
        </h2>
      </div>

      {config.isLoading && <LoadingSpinner />}
      <ErrorBanner error={(config.error ?? mutation.error) as Error | null} />

      {mutation.isSuccess && (
        <div role="status" className="rounded-[2px] border border-[#37f5a0]/40 bg-[#13201c] p-3 text-sm text-[#37f5a0]">
          Configuration saved successfully.
        </div>
      )}

      {config.data && (
        <Card>
          <DialPanel
            initialValues={config.data.values}
            onSave={handleSave}
            saving={mutation.isPending}
          />
        </Card>
      )}
    </div>
  );
}
