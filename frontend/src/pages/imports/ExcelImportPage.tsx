import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { isAxiosError } from 'axios';
import { useApp } from '../../context/AppContext';
import { api, getApiErrorMessage, getBlobApiErrorMessage } from '../../services/api';
import { BulkImportCommitResult, DryRunResult, ImportCatalogueEntry, ImportError } from '../../types';
import { PageHeader } from '../../components/ui/PageHeader';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { EmptyState, ErrorState, LoadingState } from '../../components/ui/StateViews';
import {
  Download,
  Upload,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  FileCheck,
  RefreshCw,
  MapPin,
  Users,
  ListChecks,
  FileText,
  Layers,
  Mail,
  Check,
  Network,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// One flow for every import in the server catalogue (organization units, locations, users, questions, standards, actions)
// ---------------------------------------------------------------------------

const KIND_META: Record<string, { label: string; icon: React.ReactNode; blurb: string }> = {
  'org-nodes': {
    label: 'Organization units',
    icon: <Network size={16} />,
    blurb: "Plants, departments, areas and other units of your structure. Use your organization's hierarchy levels as types; a parent can be an existing unit or another row. Import these before locations.",
  },
  locations: {
    label: 'Locations',
    icon: <MapPin size={16} />,
    blurb: 'Areas, lines and stores to be audited. Each location gets its QR code and the standard 5S milestones.',
  },
  users: {
    label: 'Users',
    icon: <Users size={16} />,
    blurb: 'Invite your team in bulk. Each person receives an email link to set their own password.',
  },
  questions: { label: 'Audit questions', icon: <ListChecks size={16} />, blurb: 'Checklist questions for audit templates.' },
  standards: { label: 'Standards', icon: <FileText size={16} />, blurb: 'Your 5S standards library.' },
  actions: { label: 'Corrective actions', icon: <Layers size={16} />, blurb: 'Open actions carried over from a previous system.' },
};

const kindLabel = (entry: ImportCatalogueEntry) => KIND_META[entry.kind]?.label || entry.title || entry.kind;

/** Spreadsheet rows start after the header line, so data row i (0-based) is spreadsheet row i + 2. */
const SHEET_ROW_OFFSET = 2;

const downloadBlob = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
};

const STEPS = ['Choose what to import', 'Get the template', 'Upload and check', 'Review', 'Import'];

/** Where the user is in the import flow (1-based); earlier steps show as done. */
const ImportSteps: React.FC<{ current: number }> = ({ current }) => (
  <ol aria-label="Import steps" style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexWrap: 'wrap', gap: '8px 24px' }}>
    {STEPS.map((step, i) => {
      const n = i + 1;
      const done = n < current;
      const active = n === current;
      return (
        <li key={step} aria-current={active ? 'step' : undefined} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', fontWeight: active ? 600 : 500, color: active ? 'var(--color-primary)' : done ? 'var(--text-primary)' : 'var(--text-tertiary)' }}>
          <span
            aria-hidden="true"
            style={{
              width: '24px',
              height: '24px',
              borderRadius: 'var(--radius-full)',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '12px',
              fontWeight: 600,
              flexShrink: 0,
              background: done || active ? 'var(--color-primary)' : 'var(--bg-surface)',
              color: done || active ? '#FFFFFF' : 'var(--text-tertiary)',
              border: done || active ? 'none' : '1px solid var(--border-strong)',
            }}
          >
            {done ? <Check size={14} strokeWidth={2.5} /> : n}
          </span>
          {step}
          {done && <span className="sr-only">(done)</span>}
        </li>
      );
    })}
  </ol>
);

const BulkImportSection: React.FC<{ entry: ImportCatalogueEntry }> = ({ entry }) => {
  const { addToast } = useApp();
  const label = kindLabel(entry);
  const inputId = `bulk-import-file-${entry.kind}`;
  const inputRef = useRef<HTMLInputElement>(null);

  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [validating, setValidating] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [result, setResult] = useState<DryRunResult | null>(null);
  const [commitResult, setCommitResult] = useState<BulkImportCommitResult | null>(null);
  const [commitError, setCommitError] = useState<string | null>(null);
  const [onlyErrors, setOnlyErrors] = useState(false);

  const columns = entry.columns || [];
  const errors: ImportError[] = result?.errors || [];
  const rows: Record<string, string>[] = Array.isArray(result?.parsedData) ? result!.parsedData : [];

  // rowNumber -> errors, and "rowNumber|header" -> message for cell highlighting
  const { errorsByRow, errorCells } = useMemo(() => {
    const byRow = new Map<number, ImportError[]>();
    const cells = new Map<string, string>();
    errors.forEach((e) => {
      byRow.set(e.rowNumber, [...(byRow.get(e.rowNumber) || []), e]);
      cells.set(`${e.rowNumber}|${String(e.field).toLowerCase()}`, e.message);
    });
    return { errorsByRow: byRow, errorCells: cells };
  }, [errors]);

  const reset = () => {
    setFile(null);
    setResult(null);
    setCommitResult(null);
    setCommitError(null);
    setOnlyErrors(false);
    if (inputRef.current) inputRef.current.value = '';
  };

  const downloadTemplate = async () => {
    setDownloading(true);
    try {
      const blob = await api.downloadImportTemplate(entry.kind);
      downloadBlob(blob, `${entry.kind}-import-template.xlsx`);
    } catch (err) {
      addToast({ type: 'error', title: 'Download failed', message: await getBlobApiErrorMessage(err, 'Could not download the import template.') });
    } finally {
      setDownloading(false);
    }
  };

  const validate = async (selected: File) => {
    if (!/\.(xlsx|xls|csv)$/i.test(selected.name)) {
      addToast({ type: 'warning', title: 'Unsupported file', message: 'Choose an .xlsx, .xls or .csv spreadsheet.' });
      return;
    }
    if (selected.size > 5 * 1024 * 1024) {
      addToast({ type: 'warning', title: 'File too large', message: 'Spreadsheets can be at most 5 MB.' });
      return;
    }
    setFile(selected);
    setResult(null);
    setCommitResult(null);
    setCommitError(null);
    setValidating(true);
    try {
      const res = await api.bulkImportDryRunFile(entry.kind, selected);
      setResult(res);
      setOnlyErrors(false);
      if ((res?.errorCount ?? 0) > 0) {
        addToast({ type: 'warning', title: 'Problems found', message: `${res.errorCount} problem(s) in ${res.totalRows} row(s). Fix them in the file and upload it again.` });
      }
    } catch (err) {
      addToast({ type: 'error', title: 'Check failed', message: getApiErrorMessage(err, 'Could not read the spreadsheet.') });
    } finally {
      setValidating(false);
    }
  };

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (selected) validate(selected);
    // Allow choosing the same (corrected) file again
    e.target.value = '';
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const dropped = e.dataTransfer.files?.[0];
    if (dropped) validate(dropped);
  };

  const commit = async () => {
    if (!result || result.errorCount > 0 || !rows.length) return;
    setCommitting(true);
    setCommitError(null);
    try {
      const res = await api.bulkImportCommit(entry.kind, rows);
      setCommitResult(res);
      addToast({ type: 'success', title: 'Import complete', message: `${res?.created ?? 0} ${label.toLowerCase()} imported.` });
    } catch (err) {
      // The server re-validates; if data changed since the check, show its problems in place
      const serverErrors: unknown = isAxiosError(err) ? (err.response?.data as { errors?: unknown } | undefined)?.errors : undefined;
      if (Array.isArray(serverErrors) && serverErrors.length) {
        const list = serverErrors as ImportError[];
        setResult((prev) => (prev ? { ...prev, errors: list, errorCount: list.length } : prev));
      }
      const message = getApiErrorMessage(err, 'The import was not saved.');
      setCommitError(message);
      addToast({ type: 'error', title: 'Import failed', message });
    } finally {
      setCommitting(false);
    }
  };

  const blocked = !result || result.errorCount > 0 || !!result.limitWarning || rows.length === 0;

  const stepper = (current: number) => (
    <div style={{ padding: '16px 20px', background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-lg)' }}>
      <ImportSteps current={current} />
    </div>
  );

  if (commitResult) {
    const invites = commitResult.invitationsSent;
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {stepper(STEPS.length + 1)}
      <Card>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: '12px', padding: '24px 12px' }}>
          <span aria-hidden="true" style={{ width: '56px', height: '56px', borderRadius: 'var(--radius-full)', background: 'var(--color-success-bg)', color: 'var(--color-success)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <CheckCircle2 size={28} />
          </span>
          <h3 style={{ fontSize: '18px', fontWeight: 600, margin: 0, color: 'var(--text-primary)' }}>
            {commitResult.created ?? 0} {label.toLowerCase()} imported
          </h3>
          {entry.kind === 'users' && (
            <p style={{ fontSize: '14px', color: 'var(--text-secondary)', margin: 0, maxWidth: '520px', lineHeight: 1.5 }}>
              <Mail size={16} aria-hidden="true" style={{ verticalAlign: '-3px', marginRight: '6px' }} />
              {invites ?? 0} invitation{invites === 1 ? '' : 's'} sent; each person sets their own password via the emailed link.
              {typeof invites === 'number' && invites < (commitResult.created ?? 0) &&
                ` ${(commitResult.created ?? 0) - invites} email(s) could not be sent; those people can use "Forgot password" on the sign-in page.`}
            </p>
          )}
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', justifyContent: 'center' }}>
            {entry.kind === 'locations' && (
              <Link to="/locations" className="btn btn-primary">
                Open locations
              </Link>
            )}
            {entry.kind === 'org-nodes' && (
              <Link to="/organization" className="btn btn-primary">
                Open organization structure
              </Link>
            )}
            <Button variant="secondary" icon={<RefreshCw size={16} />} onClick={reset}>
              Import another file
            </Button>
          </div>
        </div>
      </Card>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {stepper(result ? 4 : file ? 3 : 2)}

      {/* Step 2: template & column guide */}
      <Card
        title={`2. Get the ${label.toLowerCase()} template`}
        subtitle={KIND_META[entry.kind]?.blurb || 'Fill in the template, one record per row.'}
        actions={
          <Button variant="outline" icon={<Download size={16} />} loading={downloading} onClick={downloadTemplate}>
            Download template
          </Button>
        }
        noPadding
      >
        <div className="enterprise-table-container" style={{ border: 'none', borderRadius: 0, boxShadow: 'none' }}>
          <table className="enterprise-table" style={{ width: '100%' }}>
            <thead>
              <tr>
                <th>Column</th>
                <th>Required</th>
                <th>Description</th>
                <th>Example</th>
              </tr>
            </thead>
            <tbody>
              {columns.map((c) => (
                <tr key={c.key}>
                  <td>
                    <span className="code-tag" style={{ whiteSpace: 'nowrap' }}>
                      {c.header}
                    </span>
                  </td>
                  <td>{c.required ? <Badge variant="info">Required</Badge> : <span style={{ fontSize: '13px', color: 'var(--text-tertiary)' }}>Optional</span>}</td>
                  <td style={{ color: 'var(--text-secondary)', minWidth: '220px' }}>{c.description}</td>
                  <td style={{ fontSize: '13px' }}>
                    <code>{c.example}</code>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Step 3: upload */}
      <Card title="3. Upload and check" subtitle="Nothing is saved until you press Import; the check never changes data.">
        <div
          role="button"
          tabIndex={0}
          aria-label={`Upload ${label} spreadsheet`}
          aria-busy={validating}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              inputRef.current?.click();
            }
          }}
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          style={{
            padding: '32px 24px',
            textAlign: 'center',
            border: `2px dashed ${dragging ? 'var(--color-primary)' : 'var(--border-strong)'}`,
            borderRadius: 'var(--radius-lg)',
            background: dragging ? 'var(--color-primary-light)' : 'var(--bg-pale)',
            cursor: 'pointer',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '8px',
            transition: 'background var(--transition-fast), border-color var(--transition-fast)',
          }}
        >
          <input ref={inputRef} id={inputId} type="file" accept=".xlsx,.xls,.csv" style={{ display: 'none' }} onChange={onFileChange} />
          <span aria-hidden="true" style={{ width: '48px', height: '48px', borderRadius: 'var(--radius-full)', background: 'var(--bg-surface)', border: '1px solid var(--color-info-border)', color: 'var(--color-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {validating ? <div className="spinner" style={{ width: '20px', height: '20px' }} /> : file ? <FileCheck size={22} /> : <Upload size={22} />}
          </span>
          <span style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)', overflowWrap: 'anywhere' }}>
            {validating ? 'Checking…' : file ? file.name : 'Drop a spreadsheet here'}
          </span>
          <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
            {file && !validating ? 'Choose another file to check it again' : (
              <>or <span style={{ color: 'var(--color-primary)', fontWeight: 600, textDecoration: 'underline' }}>choose a file</span></>
            )}
          </span>
          <span style={{ fontSize: '12.5px', color: 'var(--text-tertiary)' }}>.xlsx, .xls or .csv, up to 5 MB and 2,000 rows</span>
        </div>
      </Card>

      {/* Step 3: preview & import */}
      {result && (
        <Card
          title="4. Review and import"
          subtitle={result.errorCount > 0 ? 'Fix the highlighted problems in your file, then upload it again.' : 'Everything checks out.'}
          actions={
            <>
              <Button variant="secondary" onClick={reset} disabled={committing}>
                Start over
              </Button>
              <Button
                icon={<CheckCircle2 size={16} />}
                loading={committing}
                disabled={blocked}
                onClick={commit}
                title={blocked ? 'Resolve every problem before importing' : undefined}
              >
                Import {rows.length} {label.toLowerCase()}
              </Button>
            </>
          }
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <dl
              className="keep-cols"
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
                gap: '12px',
                margin: 0,
                background: 'var(--bg-surface-subtle)',
                padding: '16px 20px',
                borderRadius: 'var(--radius-md)',
              }}
            >
              <div>
                <dt style={{ fontSize: '12.5px', fontWeight: 500, color: 'var(--text-secondary)' }}>Rows</dt>
                <dd className="tabular-nums" style={{ margin: '4px 0 0', fontSize: '20px', fontWeight: 600, color: 'var(--text-primary)' }}>
                  {result.totalRows}
                </dd>
              </div>
              <div>
                <dt style={{ fontSize: '12.5px', fontWeight: 500, color: 'var(--text-secondary)' }}>Valid rows</dt>
                <dd className="tabular-nums" style={{ margin: '4px 0 0', fontSize: '20px', fontWeight: 600, color: 'var(--color-success)' }}>
                  {result.validCount}
                </dd>
              </div>
              <div>
                <dt style={{ fontSize: '12.5px', fontWeight: 500, color: 'var(--text-secondary)' }}>Problems</dt>
                <dd className="tabular-nums" style={{ margin: '4px 0 0', fontSize: '20px', fontWeight: 600, color: result.errorCount ? 'var(--color-danger)' : 'var(--text-secondary)' }}>
                  {result.errorCount}
                </dd>
              </div>
            </dl>

            {result.limitWarning && (
              <div
                role="alert"
                style={{
                  display: 'flex',
                  gap: '8px',
                  padding: '12px 14px',
                  borderRadius: 'var(--radius-md)',
                  background: 'var(--color-warning-bg)',
                  border: '1px solid var(--color-warning-border)',
                  fontSize: '13px',
                }}
              >
                <AlertTriangle size={16} color="var(--color-warning)" aria-hidden="true" style={{ flexShrink: 0, marginTop: '1px' }} />
                <span>
                  {result.limitWarning.replace(/^PLAN_LIMIT_REACHED:\s*/, '')} Remove rows or upgrade the plan before importing.
                </span>
              </div>
            )}

            {commitError && (
              <div
                role="alert"
                style={{
                  display: 'flex',
                  gap: '8px',
                  padding: '12px 14px',
                  borderRadius: 'var(--radius-md)',
                  background: 'var(--color-danger-bg)',
                  border: '1px solid var(--color-danger-border)',
                  fontSize: '13px',
                }}
              >
                <AlertCircle size={16} color="var(--color-danger)" aria-hidden="true" style={{ flexShrink: 0, marginTop: '1px' }} />
                <span>{commitError} Upload the file again to re-check it.</span>
              </div>
            )}

            {errors.length > 0 && (
              <div style={{ border: '1px solid var(--color-danger-border)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
                <div style={{ padding: '10px 16px', background: 'var(--color-danger-bg)', color: 'var(--color-danger)', fontWeight: 600, fontSize: '13px' }}>
                  {errors.length} problem(s) to fix
                </div>
                <div style={{ maxHeight: '260px', overflow: 'auto' }}>
                  <table className="enterprise-table" style={{ width: '100%' }}>
                    <thead>
                      <tr>
                        <th>Row</th>
                        <th>Column</th>
                        <th>Value</th>
                        <th>Problem</th>
                      </tr>
                    </thead>
                    <tbody>
                      {errors.map((e, idx) => (
                        <tr key={idx}>
                          <td className="tabular-nums">
                            <strong>{e.rowNumber}</strong>
                          </td>
                          <td>
                            <span className="code-tag">{e.field}</span>
                          </td>
                          <td>
                            <code>{e.value === null || e.value === undefined || e.value === '' ? '(empty)' : String(e.value)}</code>
                          </td>
                          <td style={{ color: 'var(--color-danger)', fontWeight: 500 }}>{e.message}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {rows.length > 0 && (
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', marginBottom: '8px', flexWrap: 'wrap' }}>
                  <h4 style={{ fontSize: '14px', fontWeight: 600, margin: 0, color: 'var(--text-primary)' }}>Preview</h4>
                  {errors.length > 0 && (
                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', cursor: 'pointer', color: 'var(--text-secondary)' }}>
                      <input type="checkbox" checked={onlyErrors} onChange={(e) => setOnlyErrors(e.target.checked)} />
                      Only rows with problems
                    </label>
                  )}
                </div>
                <div className="enterprise-table-container" style={{ maxHeight: '480px', overflow: 'auto' }}>
                  <table className="enterprise-table" style={{ width: '100%' }}>
                    <thead>
                      <tr>
                        <th style={{ width: '60px' }}>Row</th>
                        {columns.map((c) => (
                          <th key={c.key} style={{ whiteSpace: 'nowrap' }}>
                            {c.header}
                            {c.required && <span style={{ color: 'var(--color-danger)' }}> *</span>}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((row, i) => {
                        const rowNumber = i + SHEET_ROW_OFFSET;
                        const rowErrors = errorsByRow.get(rowNumber);
                        if (onlyErrors && !rowErrors) return null;
                        return (
                          <tr key={i} style={rowErrors ? { background: 'var(--color-danger-bg)' } : undefined} title={rowErrors?.map((e) => e.message).join('\n')}>
                            <td className="tabular-nums" style={{ fontWeight: 600 }}>
                              {rowErrors ? <AlertCircle size={14} color="var(--color-danger)" aria-label="Row has problems" style={{ verticalAlign: '-2px', marginRight: '4px' }} /> : null}
                              {rowNumber}
                            </td>
                            {columns.map((c) => {
                              const cellError = errorCells.get(`${rowNumber}|${c.header.toLowerCase()}`);
                              return (
                                <td
                                  key={c.key}
                                  title={cellError}
                                  style={{
                                    fontSize: '13px',
                                    maxWidth: '260px',
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                    whiteSpace: 'nowrap',
                                    ...(cellError ? { color: 'var(--color-danger)', fontWeight: 600, boxShadow: 'inset 0 0 0 1px var(--color-danger-border)' } : {}),
                                  }}
                                >
                                  {row?.[c.key] || (cellError ? '(empty)' : '')}
                                </td>
                              );
                            })}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </Card>
      )}
    </div>
  );
};

/** Bulk imports hub: every importer in the server catalogue, all using the same check-then-import flow. */
export const ExcelImportPage: React.FC = () => {
  const [catalogue, setCatalogue] = useState<ImportCatalogueEntry[]>([]);
  const [catalogueError, setCatalogueError] = useState<string | null>(null);
  const [loadingCatalogue, setLoadingCatalogue] = useState(true);
  const [activeKind, setActiveKind] = useState<string>('locations');

  const loadCatalogue = useCallback(async () => {
    setLoadingCatalogue(true);
    setCatalogueError(null);
    try {
      const list = await api.getImportCatalogue();
      setCatalogue(list);
      setActiveKind((current) => (list.some((c) => c.kind === current) ? current : list[0]?.kind ?? current));
    } catch (err) {
      setCatalogueError(getApiErrorMessage(err, 'The available imports could not be loaded.'));
    } finally {
      setLoadingCatalogue(false);
    }
  }, []);

  useEffect(() => {
    loadCatalogue();
  }, [loadCatalogue]);

  const activeEntry = catalogue.find((c) => c.kind === activeKind) || null;

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <PageHeader
        title="Spreadsheet imports"
        description="Choose what to import, fill in the template, and upload it. Every file is checked before anything is saved, and each import is all-or-nothing."
      />

      {loadingCatalogue && catalogue.length === 0 ? (
        <Card><LoadingState label="Loading imports…" /></Card>
      ) : catalogueError ? (
        <Card><ErrorState message={catalogueError} onRetry={loadCatalogue} /></Card>
      ) : catalogue.length === 0 ? (
        <Card><EmptyState title="No imports available" /></Card>
      ) : (
        <>
          {/* Step 1: what to import */}
          <Card title="1. Choose what to import">
            <div role="group" aria-label="What to import" style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
              {catalogue.map((c) => {
                const active = c.kind === activeKind;
                return (
                  <button
                    key={c.kind}
                    type="button"
                    className={`pillar-tab-pill${active ? ' active' : ''}`}
                    aria-pressed={active}
                    onClick={() => setActiveKind(c.kind)}
                    style={{ gap: '8px', minHeight: '40px' }}
                  >
                    <span aria-hidden="true" style={{ display: 'inline-flex' }}>{KIND_META[c.kind]?.icon || <FileCheck size={16} />}</span>
                    {kindLabel(c)}
                  </button>
                );
              })}
            </div>
          </Card>
          {activeEntry && <BulkImportSection key={activeEntry.kind} entry={activeEntry} />}
        </>
      )}
    </div>
  );
};
